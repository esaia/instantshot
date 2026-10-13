//! Region capture. Each platform captures exactly one rectangle on one display, excluding
//! TextPicker's own windows, and returns it as a BGRA8 [`Frame`]. Nothing is written to disk.

use crate::display::Display;
use crate::error::CaptureError;
use crate::geometry::Rect;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

/// An 8-bit BGRA image (alpha is ignored). Rows may be padded: use `stride`.
pub struct Frame {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub pixels: Vec<u8>,
}

impl std::fmt::Debug for Frame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Frame({}x{})", self.width, self.height)
    }
}

/// Shared capture interface; the platform implementation is selected at compile time.
pub trait ScreenCapturer {
    /// Captures `rect` (display-local logical units, already clamped) from `display`.
    fn capture_region(&self, display: &Display, rect: Rect) -> Result<Frame, CaptureError>;
}

#[cfg(target_os = "macos")]
pub type PlatformCapturer = macos::ScreenCaptureKit;
#[cfg(windows)]
pub type PlatformCapturer = windows::GdiCapturer;

/// Clamps the selection to the display and captures it. Must not be called on the main thread.
pub fn capture_region(display: &Display, rect: Rect) -> Result<Frame, CaptureError> {
    let rect = rect
        .clamp_to(display.logical.width, display.logical.height)
        .filter(Rect::is_selection)
        .ok_or(CaptureError::EmptySelection)?;
    #[cfg(any(target_os = "macos", windows))]
    {
        PlatformCapturer::default().capture_region(display, rect)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = rect;
        Err(CaptureError::Platform("unsupported platform".into()))
    }
}
