//! Region capture. Each platform captures exactly one rectangle on one display, excluding
//! InstantShot's own windows, and returns it as a BGRA8 [`Frame`]. Nothing is written to disk.

use crate::display::Display;
use crate::error::CaptureError;
use crate::geometry::{PixelRect, Rect};

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

impl Frame {
    /// Copies the `px` region (clamped to the frame) into a new, tightly packed frame.
    /// `None` if nothing of it lies inside.
    pub fn crop(&self, px: PixelRect) -> Option<Frame> {
        let x0 = (px.x.max(0) as u32).min(self.width);
        let y0 = (px.y.max(0) as u32).min(self.height);
        let x1 = (px.x.max(0) as u32)
            .saturating_add(px.width)
            .min(self.width);
        let y1 = (px.y.max(0) as u32)
            .saturating_add(px.height)
            .min(self.height);
        if x1 <= x0 || y1 <= y0 {
            return None;
        }
        let (w, h) = (x1 - x0, y1 - y0);
        let row = w as usize * 4;
        let mut pixels = Vec::with_capacity(row * h as usize);
        for y in y0..y1 {
            let start = y as usize * self.stride + x0 as usize * 4;
            pixels.extend_from_slice(&self.pixels[start..start + row]);
        }
        Some(Frame {
            width: w,
            height: h,
            stride: row,
            pixels,
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crops_a_padded_frame_and_clamps_to_its_edges() {
        // 3×2 frame, stride 16 (4 bytes of padding per row); pixel value = 10*y + x.
        let mut pixels = vec![0u8; 32];
        for y in 0..2 {
            for x in 0..3 {
                pixels[y * 16 + x * 4] = (10 * y + x) as u8;
            }
        }
        let frame = Frame {
            width: 3,
            height: 2,
            stride: 16,
            pixels,
        };
        let crop = frame
            .crop(PixelRect {
                x: 1,
                y: 1,
                width: 5,
                height: 5,
            })
            .expect("inside");
        assert_eq!((crop.width, crop.height, crop.stride), (2, 1, 8));
        assert_eq!((crop.pixels[0], crop.pixels[4]), (11, 12));
        assert!(
            frame
                .crop(PixelRect {
                    x: 3,
                    y: 0,
                    width: 2,
                    height: 2,
                })
                .is_none()
        );
    }
}
