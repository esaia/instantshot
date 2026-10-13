//! Coordinate conversion between overlay (CSS/logical) space and capture (physical pixel) space.
//!
//! Strategy: every overlay window covers exactly one display, so a selection arrives as a rect in
//! *display-local logical units* (CSS px in the webview == points on macOS == DIPs on Windows).
//! - macOS capture APIs take display-local points directly; output pixels = points × scale.
//! - Windows capture APIs take absolute physical pixels; we scale by the monitor's DPI factor and
//!   offset by the monitor's physical origin (which can be negative).
//!
//! Edges are rounded independently (not origin + rounded size) so adjacent selections tile
//! without gaps or overlaps at fractional scales such as 1.25× or 1.5×.

use serde::{Deserialize, Serialize};

/// Smallest selection (in logical units, per side) that is treated as intentional.
pub const MIN_SELECTION: f64 = 4.0;

/// A rectangle in logical (CSS/point) units.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A rectangle in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PixelRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Returns an equivalent rect with non-negative width and height.
    pub fn normalized(self) -> Self {
        let (x, width) = if self.width < 0.0 {
            (self.x + self.width, -self.width)
        } else {
            (self.x, self.width)
        };
        let (y, height) = if self.height < 0.0 {
            (self.y + self.height, -self.height)
        } else {
            (self.y, self.height)
        };
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Intersects the rect with `(0, 0, bounds_w, bounds_h)`. Returns `None` if nothing remains
    /// or the input is not finite.
    pub fn clamp_to(self, bounds_w: f64, bounds_h: f64) -> Option<Self> {
        let r = self.normalized();
        if ![r.x, r.y, r.width, r.height].iter().all(|v| v.is_finite()) {
            return None;
        }
        let x0 = r.x.max(0.0);
        let y0 = r.y.max(0.0);
        let x1 = (r.x + r.width).min(bounds_w);
        let y1 = (r.y + r.height).min(bounds_h);
        (x1 > x0 && y1 > y0).then(|| Self::new(x0, y0, x1 - x0, y1 - y0))
    }

    pub fn is_selection(&self) -> bool {
        self.width >= MIN_SELECTION && self.height >= MIN_SELECTION
    }
}

/// Converts a display-local logical rect into display-local physical pixels.
pub fn to_physical(rect: Rect, scale: f64) -> PixelRect {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let x0 = (rect.x * scale).round();
    let y0 = (rect.y * scale).round();
    let x1 = ((rect.x + rect.width) * scale).round();
    let y1 = ((rect.y + rect.height) * scale).round();
    PixelRect {
        x: x0 as i32,
        y: y0 as i32,
        width: (x1 - x0).max(1.0) as u32,
        height: (y1 - y0).max(1.0) as u32,
    }
}

/// Offsets a display-local pixel rect by the display's physical origin in the virtual desktop.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn to_virtual_desktop(rect: PixelRect, origin_x: i32, origin_y: i32) -> PixelRect {
    PixelRect {
        x: rect.x + origin_x,
        y: rect.y + origin_y,
        ..rect
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_negative_drags() {
        let r = Rect::new(100.0, 80.0, -40.0, -30.0).normalized();
        assert_eq!(r, Rect::new(60.0, 50.0, 40.0, 30.0));
    }

    #[test]
    fn clamps_to_display_bounds() {
        let r = Rect::new(-10.0, 1000.0, 50.0, 200.0).clamp_to(1440.0, 1100.0);
        assert_eq!(r, Some(Rect::new(0.0, 1000.0, 40.0, 100.0)));
    }

    #[test]
    fn clamp_rejects_outside_and_non_finite() {
        assert_eq!(
            Rect::new(2000.0, 0.0, 10.0, 10.0).clamp_to(1440.0, 900.0),
            None
        );
        assert_eq!(
            Rect::new(f64::NAN, 0.0, 10.0, 10.0).clamp_to(1440.0, 900.0),
            None
        );
    }

    #[test]
    fn tiny_selections_are_rejected() {
        assert!(!Rect::new(0.0, 0.0, 3.9, 100.0).is_selection());
        assert!(Rect::new(0.0, 0.0, 4.0, 4.0).is_selection());
    }

    #[test]
    fn scale_1x_is_identity() {
        let p = to_physical(Rect::new(10.0, 20.0, 300.0, 40.0), 1.0);
        assert_eq!(
            p,
            PixelRect {
                x: 10,
                y: 20,
                width: 300,
                height: 40
            }
        );
    }

    #[test]
    fn retina_2x_doubles() {
        let p = to_physical(Rect::new(10.5, 20.0, 300.0, 40.25), 2.0);
        assert_eq!(
            p,
            PixelRect {
                x: 21,
                y: 40,
                width: 600,
                height: 81
            }
        );
    }

    #[test]
    fn fractional_scales_round_edges_independently() {
        // 125%: x0 = 12.5 -> 13 (round half away from zero), x1 = 137.5 -> 138
        let p = to_physical(Rect::new(10.0, 10.0, 100.0, 100.0), 1.25);
        assert_eq!(
            p,
            PixelRect {
                x: 13,
                y: 13,
                width: 125,
                height: 125
            }
        );
        // 150%: two adjacent rects share an edge exactly.
        let a = to_physical(Rect::new(0.0, 0.0, 33.0, 10.0), 1.5);
        let b = to_physical(Rect::new(33.0, 0.0, 33.0, 10.0), 1.5);
        assert_eq!(a.x + a.width as i32, b.x);
    }

    #[test]
    fn never_produces_zero_size() {
        let p = to_physical(Rect::new(0.0, 0.0, 0.1, 0.1), 1.0);
        assert_eq!((p.width, p.height), (1, 1));
    }

    #[test]
    fn invalid_scale_falls_back_to_1x() {
        let p = to_physical(Rect::new(1.0, 2.0, 3.0, 4.0), 0.0);
        assert_eq!(
            p,
            PixelRect {
                x: 1,
                y: 2,
                width: 3,
                height: 4
            }
        );
    }

    #[test]
    fn negative_monitor_origins() {
        // Secondary monitor at 150% placed left of and above the primary.
        let local = to_physical(Rect::new(100.0, 50.0, 200.0, 20.0), 1.5);
        let abs = to_virtual_desktop(local, -2880, -400);
        assert_eq!(
            abs,
            PixelRect {
                x: -2730,
                y: -325,
                width: 300,
                height: 30
            }
        );
    }
}
