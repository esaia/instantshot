//! Local OCR. Each backend returns positioned text fragments; [`layout::compose`] turns them into
//! plain text the same way on every platform.

pub mod layout;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

use crate::capture::Frame;
use crate::error::OcrError;

#[derive(Clone, Copy, Debug)]
pub struct OcrOptions {
    /// Let Vision detect the language (macOS). Windows OCR always uses the profile languages.
    #[cfg_attr(windows, allow(dead_code))]
    pub auto_language: bool,
    pub preserve_line_breaks: bool,
}

impl Default for OcrOptions {
    fn default() -> Self {
        Self {
            auto_language: true,
            preserve_line_breaks: true,
        }
    }
}

/// A recognized fragment (usually a line or line segment). Pixels, top-left origin.
#[derive(Clone, Debug, PartialEq)]
pub struct TextBox {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Shared OCR interface; the platform engine is selected at compile time.
pub trait OcrEngine {
    /// Blocking. Must run off the main/UI thread.
    fn recognize(&self, frame: &Frame, options: &OcrOptions) -> Result<Vec<TextBox>, OcrError>;
}

#[cfg(target_os = "macos")]
pub type PlatformEngine = macos::VisionEngine;
#[cfg(windows)]
pub type PlatformEngine = windows::WindowsOcrEngine;

/// Recognizes text in `frame` and returns cleaned-up plain text (possibly empty).
pub fn recognize_text(frame: &Frame, options: &OcrOptions) -> Result<String, OcrError> {
    #[cfg(any(target_os = "macos", windows))]
    {
        let boxes = PlatformEngine::default().recognize(frame, options)?;
        Ok(layout::compose(&boxes, options.preserve_line_breaks))
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (frame, options);
        Err(OcrError::Platform("unsupported platform".into()))
    }
}

/// Describes OCR availability for the settings UI.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStatus {
    pub available: bool,
    pub languages: Vec<String>,
}

pub fn language_status() -> LanguageStatus {
    #[cfg(target_os = "macos")]
    {
        macos::language_status()
    }
    #[cfg(windows)]
    {
        windows::language_status()
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        LanguageStatus {
            available: false,
            languages: Vec::new(),
        }
    }
}

#[cfg(all(test, any(target_os = "macos", windows)))]
mod tests;
