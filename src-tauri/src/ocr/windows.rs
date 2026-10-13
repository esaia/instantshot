//! Windows.Media.Ocr. Requires at least one installed language with the OCR feature.
//! Called from a Tokio blocking thread; WinRT calls here are agile, and `join()` blocks until
//! the async recognition completes.

use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine as WinOcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};

use super::{LanguageStatus, OcrEngine, OcrOptions, TextBox};
use crate::capture::Frame;
use crate::error::OcrError;

#[derive(Default)]
pub struct WindowsOcrEngine;

fn platform(err: windows::core::Error) -> OcrError {
    OcrError::Platform(err.message())
}

fn ensure_com() {
    // SAFETY: joining the MTA on a worker thread; repeated calls just return S_FALSE.
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
}

fn engine(_options: &OcrOptions) -> Result<WinOcrEngine, OcrError> {
    // Windows OCR is single-language per engine. "Automatic" means the user's profile
    // languages; if none of them has OCR installed, fall back to any installed recognizer.
    if let Ok(engine) = WinOcrEngine::TryCreateFromUserProfileLanguages() {
        return Ok(engine);
    }
    let languages = WinOcrEngine::AvailableRecognizerLanguages().map_err(platform)?;
    for i in 0..languages.Size().map_err(platform)? {
        let language: Language = languages.GetAt(i).map_err(platform)?;
        if let Ok(engine) = WinOcrEngine::TryCreateFromLanguage(&language) {
            return Ok(engine);
        }
    }
    Err(OcrError::NoLanguage)
}

impl OcrEngine for WindowsOcrEngine {
    fn recognize(&self, frame: &Frame, options: &OcrOptions) -> Result<Vec<TextBox>, OcrError> {
        ensure_com();
        let engine = engine(options)?;
        let max = WinOcrEngine::MaxImageDimension().map_err(platform)?;
        let (width, height, packed) = prepare_pixels(frame, max);
        if width == 0 || height == 0 {
            return Err(OcrError::ImageTooLarge);
        }

        let writer = DataWriter::new().map_err(platform)?;
        writer.WriteBytes(&packed).map_err(platform)?;
        let buffer = writer.DetachBuffer().map_err(platform)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &buffer,
            BitmapPixelFormat::Bgra8,
            width as i32,
            height as i32,
        )
        .map_err(platform)?;

        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(platform)?
            .join()
            .map_err(platform)?;
        let lines = result.Lines().map_err(platform)?;
        let mut boxes = Vec::new();
        for i in 0..lines.Size().map_err(platform)? {
            let line = lines.GetAt(i).map_err(platform)?;
            // The line text uses the right separators for the script (none for CJK).
            let text = line.Text().map_err(platform)?.to_string();
            let words = line.Words().map_err(platform)?;
            let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
            for j in 0..words.Size().map_err(platform)? {
                let r = words
                    .GetAt(j)
                    .map_err(platform)?
                    .BoundingRect()
                    .map_err(platform)?;
                x0 = x0.min(f64::from(r.X));
                y0 = y0.min(f64::from(r.Y));
                x1 = x1.max(f64::from(r.X + r.Width));
                y1 = y1.max(f64::from(r.Y + r.Height));
            }
            if x1 > x0 && y1 > y0 {
                boxes.push(TextBox {
                    text,
                    x: x0,
                    y: y0,
                    width: x1 - x0,
                    height: y1 - y0,
                });
            }
        }
        Ok(boxes)
    }
}

/// Returns a tightly packed, opaque BGRA buffer no larger than `max` on either side
/// (Windows OCR rejects larger images). Downscaling uses box averaging to keep glyphs legible.
fn prepare_pixels(frame: &Frame, max: u32) -> (u32, u32, Vec<u8>) {
    let factor = (frame.width.max(frame.height) as f64 / max.max(1) as f64).max(1.0);
    let width = (frame.width as f64 / factor).floor() as u32;
    let height = (frame.height as f64 / factor).floor() as u32;
    let mut out = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        let sy0 = (y as f64 * factor) as u32;
        let sy1 = (((y + 1) as f64 * factor) as u32).clamp(sy0 + 1, frame.height);
        for x in 0..width {
            let sx0 = (x as f64 * factor) as u32;
            let sx1 = (((x + 1) as f64 * factor) as u32).clamp(sx0 + 1, frame.width);
            let mut acc = [0u32; 3];
            for sy in sy0..sy1 {
                let row = sy as usize * frame.stride;
                for sx in sx0..sx1 {
                    let i = row + sx as usize * 4;
                    acc[0] += u32::from(frame.pixels[i]);
                    acc[1] += u32::from(frame.pixels[i + 1]);
                    acc[2] += u32::from(frame.pixels[i + 2]);
                }
            }
            let n = (sy1 - sy0) * (sx1 - sx0);
            out.extend_from_slice(&[
                (acc[0] / n) as u8,
                (acc[1] / n) as u8,
                (acc[2] / n) as u8,
                255,
            ]);
        }
    }
    (width, height, out)
}

pub fn language_status() -> LanguageStatus {
    ensure_com();
    let languages: Vec<String> = WinOcrEngine::AvailableRecognizerLanguages()
        .ok()
        .map(|list| {
            (0..list.Size().unwrap_or(0))
                .filter_map(|i| list.GetAt(i).ok())
                .filter_map(|l| l.LanguageTag().ok())
                .map(|t| t.to_string())
                .collect()
        })
        .unwrap_or_default();
    LanguageStatus {
        available: !languages.is_empty(),
        languages,
    }
}
