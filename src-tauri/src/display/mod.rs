//! Native display enumeration. We do not rely on the webview's monitor list because capture and
//! overlay placement need platform identifiers and exact native geometry.

use crate::geometry::Rect;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::list;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::list;

#[cfg(not(any(target_os = "macos", windows)))]
pub fn list() -> Vec<Display> {
    Vec::new()
}

#[derive(Clone, Debug, PartialEq)]
pub struct Display {
    /// Stable identifier, safe to use in a window label (`[A-Za-z0-9_-]`).
    /// macOS: `CGDirectDisplayID`. Windows: sanitized GDI device name (e.g. `DISPLAY1`).
    pub id: String,
    /// Bounds in logical units within the global desktop (top-left origin of the primary display).
    /// macOS: points. Windows: physical pixels divided by `scale` (informational only).
    pub logical: Rect,
    /// Physical origin and size in the virtual desktop (Windows capture/placement).
    pub physical_x: i32,
    pub physical_y: i32,
    pub physical_width: u32,
    pub physical_height: u32,
    /// Backing scale factor (macOS) or DPI / 96 (Windows).
    pub scale: f64,
}

impl Display {
    pub fn window_label(&self) -> String {
        format!("{}{}", OVERLAY_LABEL_PREFIX, self.id)
    }
}

pub const OVERLAY_LABEL_PREFIX: &str = "overlay-";
