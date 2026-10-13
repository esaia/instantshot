//! GDI `BitBlt` region capture from the composed desktop.
//!
//! Overlays are excluded with `WDA_EXCLUDEFROMCAPTURE` (Windows 10 2004+). On older builds we
//! wait for DWM to present the frame in which the overlays are hidden. Protected content
//! (DRM video, secure desktop) is returned black by the OS and simply yields no text.

use std::ffi::c_void;

use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, CreateCompatibleBitmap,
    CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, GetDIBits, HGDIOBJ,
    ReleaseDC, SRCCOPY, SelectObject,
};

use super::{Frame, ScreenCapturer};
use crate::display::Display;
use crate::error::CaptureError;
use crate::geometry::{Rect, to_physical, to_virtual_desktop};

#[derive(Default)]
pub struct GdiCapturer;

impl ScreenCapturer for GdiCapturer {
    fn capture_region(&self, display: &Display, rect: Rect) -> Result<Frame, CaptureError> {
        // BitBlt silently returns black for regions that no longer map to a monitor.
        let still_connected = crate::display::list().iter().any(|d| {
            d.id == display.id
                && d.physical_x == display.physical_x
                && d.physical_y == display.physical_y
                && d.physical_width == display.physical_width
                && d.physical_height == display.physical_height
        });
        if !still_connected {
            return Err(CaptureError::DisplayUnavailable);
        }
        if !crate::overlay::exclusion_supported() {
            // Overlays may still be on screen; wait for the compositor to present without them.
            for _ in 0..2 {
                // SAFETY: no arguments; fails harmlessly if composition is unavailable.
                let _ = unsafe { DwmFlush() };
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }

        let local = to_physical(rect, display.scale);
        let px = to_virtual_desktop(local, display.physical_x, display.physical_y);
        let (w, h) = (px.width as i32, px.height as i32);
        let stride = px.width as usize * 4;
        let mut pixels = vec![0u8; stride * px.height as usize];

        // SAFETY: standard GDI sequence; every handle is released on all paths below.
        unsafe {
            let screen = GetDC(None);
            if screen.is_invalid() {
                return Err(CaptureError::Platform("GetDC failed".into()));
            }
            let mem = CreateCompatibleDC(Some(screen));
            let bitmap = CreateCompatibleBitmap(screen, w, h);
            let previous = SelectObject(mem, HGDIOBJ(bitmap.0));

            let blit = BitBlt(
                mem,
                0,
                0,
                w,
                h,
                Some(screen),
                px.x,
                px.y,
                SRCCOPY | CAPTUREBLT,
            );
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h, // top-down rows
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let lines = if blit.is_ok() {
                GetDIBits(
                    mem,
                    bitmap,
                    0,
                    px.height,
                    Some(pixels.as_mut_ptr().cast::<c_void>()),
                    &mut info,
                    DIB_RGB_COLORS,
                )
            } else {
                0
            };

            SelectObject(mem, previous);
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);

            if let Err(err) = blit {
                return Err(CaptureError::Platform(format!("BitBlt: {err}")));
            }
            if lines != h {
                return Err(CaptureError::Platform("GetDIBits returned no data".into()));
            }
        }

        Ok(Frame {
            width: px.width,
            height: px.height,
            stride,
            pixels,
        })
    }
}
