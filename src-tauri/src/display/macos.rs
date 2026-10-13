use objc2_core_graphics::{
    CGDirectDisplayID, CGDisplayBounds, CGDisplayCopyDisplayMode, CGDisplayMode,
    CGGetActiveDisplayList,
};

use super::Display;
use crate::geometry::Rect;

/// Lists active displays using CoreGraphics. Safe to call from any thread.
///
/// `CGDisplayBounds` is already in the global top-left-origin point space that ScreenCaptureKit
/// uses, so no flipping is needed here.
pub fn list() -> Vec<Display> {
    const MAX: usize = 32;
    let mut ids: [CGDirectDisplayID; MAX] = [0; MAX];
    let mut count: u32 = 0;
    // SAFETY: the buffer holds MAX entries and `count` is a valid out-pointer.
    let err = unsafe { CGGetActiveDisplayList(MAX as u32, ids.as_mut_ptr(), &mut count) };
    if err.0 != 0 {
        log::warn!("CGGetActiveDisplayList failed: {}", err.0);
        return Vec::new();
    }

    ids[..count as usize]
        .iter()
        .map(|&id| {
            let b = CGDisplayBounds(id);
            let scale = backing_scale(id, b.size.width);
            Display {
                id: id.to_string(),
                logical: Rect::new(b.origin.x, b.origin.y, b.size.width, b.size.height),
                physical_x: (b.origin.x * scale).round() as i32,
                physical_y: (b.origin.y * scale).round() as i32,
                physical_width: (b.size.width * scale).round() as u32,
                physical_height: (b.size.height * scale).round() as u32,
                scale,
            }
        })
        .collect()
}

/// Pixel width of the current mode's backing store divided by its point width.
fn backing_scale(id: CGDirectDisplayID, points_width: f64) -> f64 {
    let mode = CGDisplayCopyDisplayMode(id);
    let pixels = CGDisplayMode::pixel_width(mode.as_deref()) as f64;
    if points_width > 0.0 && pixels > 0.0 {
        pixels / points_width
    } else {
        1.0
    }
}
