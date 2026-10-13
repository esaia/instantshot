//! Runs the real platform OCR engine on committed fixture images (rendered text, not photos).
//! Assertions are deliberately tolerant: they check content and structure, not exact output.

use super::{OcrOptions, language_status, recognize_text};
use crate::capture::Frame;

fn load(name: &str) -> Frame {
    let path = format!("{}/tests/fixtures/{name}.png", env!("CARGO_MANIFEST_DIR"));
    let mut decoder =
        png::Decoder::new(std::io::BufReader::new(std::fs::File::open(path).unwrap()));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().unwrap();
    let mut buf = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buf).unwrap();
    let channels = info.color_type.samples();
    let mut pixels = Vec::with_capacity(info.width as usize * info.height as usize * 4);
    for px in buf[..info.buffer_size()].chunks_exact(channels) {
        let (r, g, b) = if channels >= 3 {
            (px[0], px[1], px[2])
        } else {
            (px[0], px[0], px[0])
        };
        pixels.extend_from_slice(&[b, g, r, 255]);
    }
    Frame {
        width: info.width,
        height: info.height,
        stride: info.width as usize * 4,
        pixels,
    }
}

fn ocr(name: &str) -> Option<String> {
    if !language_status().available {
        eprintln!("skipping OCR fixture test: no OCR language available on this machine");
        return None;
    }
    let started = std::time::Instant::now();
    let text = recognize_text(&load(name), &OcrOptions::default()).unwrap();
    eprintln!("{name}: {:?} in {:?}", text, started.elapsed());
    Some(text)
}

#[test]
fn english_multiline() {
    let Some(text) = ocr("english") else { return };
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2, "{text:?}");
    assert!(lines[0].contains("quick brown fox"), "{text:?}");
    assert!(lines[1].contains("liquor jugs"), "{text:?}");
}

#[test]
fn code_keeps_lines_and_indentation() {
    let Some(text) = ocr("code") else { return };
    let lines: Vec<&str> = text.lines().collect();
    // Vision sometimes drops a line holding a lone punctuation mark (the closing brace).
    assert!((3..=4).contains(&lines.len()), "{text:?}");
    assert!(lines[0].starts_with("fn main"), "{text:?}");
    assert!(lines[1].contains("answer = 42"), "{text:?}");
    // Indentation depends on the engine's box geometry; verified for Vision. Windows output is
    // reported (see --nocapture) until calibrated on real hardware.
    if cfg!(target_os = "macos") {
        assert!(lines[1].starts_with("    "), "indentation lost: {text:?}");
        assert!(lines[2].starts_with("    println!"), "{text:?}");
    }
}

#[test]
fn light_text_on_dark_background() {
    let Some(text) = ocr("dark") else { return };
    assert!(text.contains("dark background"), "{text:?}");
}

#[test]
fn small_text() {
    let Some(text) = ocr("small") else { return };
    // 11 px text at 1x. Vision handles it; Windows OCR quality here is not yet calibrated.
    if cfg!(target_os = "macos") {
        assert!(text.to_lowercase().contains("caption"), "{text:?}");
    }
}

#[test]
fn blank_image_yields_no_text() {
    let Some(text) = ocr("blank") else { return };
    assert!(text.trim().is_empty(), "{text:?}");
}

#[cfg(target_os = "macos")]
#[test]
fn unicode_text() {
    let Some(text) = ocr("unicode") else { return };
    assert!(text.contains("Привет"), "{text:?}");
    assert!(text.contains("Café"), "{text:?}");
    assert!(text.contains("日本語"), "{text:?}");
}

#[test]
fn print_supported_languages() {
    eprintln!("{:?}", language_status());
}
