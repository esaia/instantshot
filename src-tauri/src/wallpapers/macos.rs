//! ImageIO decoding (downscaled while decoding, so a 6K HEIC never fully decodes) and the
//! current desktop picture.

use std::ffi::c_void;
use std::path::{Path, PathBuf};

use objc2::MainThreadMarker;
use objc2_app_kit::{NSScreen, NSWorkspace};
use objc2_core_foundation::{
    CFBoolean, CFData, CFDictionary, CFNumber, CFRetained, CFString, CFType,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo,
};
use objc2_image_io::{
    CGImageSource, kCGImageSourceCreateThumbnailFromImageAlways,
    kCGImageSourceCreateThumbnailWithTransform, kCGImageSourceThumbnailMaxPixelSize,
};

pub const DIRECTORIES: &[&str] = &[
    "/System/Library/Desktop Pictures",
    "/Library/Desktop Pictures",
];

/// The main screen's desktop picture. Requires the main thread.
pub fn current_desktop() -> Option<PathBuf> {
    let mtm = MainThreadMarker::new()?;
    let screen = NSScreen::mainScreen(mtm)?;
    NSWorkspace::sharedWorkspace()
        .desktopImageURLForScreen(&screen)?
        .to_file_path()
}

/// Decodes `path` so its longer edge is at most `max_px`. Returns packed RGBA.
pub fn decode(path: &Path, max_px: u32) -> Option<(u32, u32, Vec<u8>)> {
    let bytes = std::fs::read(path).ok()?;
    let data = CFData::from_bytes(&bytes);
    // SAFETY: the option keys are ImageIO's own constants; values have the documented types.
    let image = unsafe {
        let source = CGImageSource::with_data(&data, None)?;
        let size = CFNumber::new_i64(max_px as i64);
        let keys: [&CFString; 3] = [
            kCGImageSourceCreateThumbnailFromImageAlways,
            kCGImageSourceCreateThumbnailWithTransform,
            kCGImageSourceThumbnailMaxPixelSize,
        ];
        let values: [&CFType; 3] = [CFBoolean::new(true), CFBoolean::new(true), &size];
        let options: CFRetained<CFDictionary<CFString, CFType>> =
            CFDictionary::from_slices(&keys, &values);
        source.thumbnail_at_index(0, Some(options.as_opaque()))?
    };
    draw_rgba(&image)
}

fn draw_rgba(image: &CGImage) -> Option<(u32, u32, Vec<u8>)> {
    let width = CGImage::width(Some(image));
    let height = CGImage::height(Some(image));
    if width == 0 || height == 0 {
        return None;
    }
    let stride = width * 4;
    let mut pixels = vec![0u8; stride * height];
    let space = CGColorSpace::new_device_rgb()?;
    // SAFETY: `pixels` outlives the context and is exactly `stride * height` bytes.
    let ctx = unsafe {
        CGBitmapContextCreate(
            pixels.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            stride,
            Some(&space),
            CGImageAlphaInfo::PremultipliedLast.0,
        )
    }?;
    let bounds = CGRect::new(CGPoint::ZERO, CGSize::new(width as f64, height as f64));
    CGContext::draw_image(Some(&ctx), bounds, Some(image));
    drop(ctx);
    Some((width as u32, height as u32, pixels))
}
