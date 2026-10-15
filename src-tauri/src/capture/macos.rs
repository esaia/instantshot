//! ScreenCaptureKit one-shot capture (`SCScreenshotManager`, macOS 14+).
//!
//! The capture filter excludes InstantShot's own process, so the selection overlay can still be on
//! screen while the region is captured. Completion handlers run on ScreenCaptureKit's queue; all
//! Objective-C objects stay inside those callbacks and only a plain [`Frame`] crosses threads.

use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::AllocAnyThread;
use objc2::rc::Retained;
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo, CGPreflightScreenCaptureAccess,
};
use objc2_foundation::{NSArray, NSError};
use objc2_screen_capture_kit::{
    SCCaptureResolutionType, SCContentFilter, SCDisplay, SCRunningApplication, SCScreenshotManager,
    SCShareableContent, SCStreamConfiguration, SCWindow,
};

use super::{Frame, ScreenCapturer};
use crate::display::Display;
use crate::error::CaptureError;
use crate::geometry::{Rect, to_physical};

const TIMEOUT: Duration = Duration::from_secs(5);
/// `SCStreamErrorUserDeclined`
const ERROR_USER_DECLINED: isize = -3801;

#[derive(Default)]
pub struct ScreenCaptureKit;

type Reply = mpsc::Sender<Result<Frame, CaptureError>>;

impl ScreenCapturer for ScreenCaptureKit {
    fn capture_region(&self, display: &Display, rect: Rect) -> Result<Frame, CaptureError> {
        if !CGPreflightScreenCaptureAccess() {
            return Err(CaptureError::PermissionDenied);
        }
        let display_id: u32 = display
            .id
            .parse()
            .map_err(|_| CaptureError::DisplayUnavailable)?;
        let pixels = to_physical(rect, display.scale);
        let request = Request {
            display_id,
            source: CGRect::new(
                CGPoint::new(rect.x, rect.y),
                CGSize::new(rect.width, rect.height),
            ),
            width: pixels.width as usize,
            height: pixels.height as usize,
            pid: std::process::id() as i32,
        };

        let (tx, rx) = mpsc::channel();
        let handler = RcBlock::new(
            move |content: *mut SCShareableContent, error: *mut NSError| {
                // SAFETY: ScreenCaptureKit passes either a valid object or null for each argument.
                let result = match unsafe { Retained::retain(content) } {
                    Some(content) => request.capture(&content, tx.clone()),
                    None => Err(ns_error(error)),
                };
                if let Err(err) = result {
                    let _ = tx.send(Err(err));
                }
            },
        );
        // SAFETY: the block matches the expected signature and is retained by ScreenCaptureKit.
        unsafe { SCShareableContent::getShareableContentWithCompletionHandler(&handler) };

        rx.recv_timeout(TIMEOUT)
            .unwrap_or(Err(CaptureError::Timeout))
    }
}

#[derive(Clone, Copy)]
struct Request {
    display_id: u32,
    source: CGRect,
    width: usize,
    height: usize,
    pid: i32,
}

impl Request {
    /// Builds the filter/configuration and starts the screenshot. Runs on SCK's callback queue.
    fn capture(&self, content: &SCShareableContent, tx: Reply) -> Result<(), CaptureError> {
        // SAFETY: plain property access on a valid SCShareableContent snapshot.
        let (displays, apps) = unsafe { (content.displays(), content.applications()) };
        let display: Retained<SCDisplay> = displays
            .iter()
            .find(|d| unsafe { d.displayID() } == self.display_id)
            .ok_or(CaptureError::DisplayUnavailable)?;
        let own: Vec<Retained<SCRunningApplication>> = apps
            .iter()
            .filter(|a| unsafe { a.processID() } == self.pid)
            .collect();

        // SAFETY: standard initializers/setters on freshly allocated objects.
        let (filter, config) = unsafe {
            let filter = SCContentFilter::initWithDisplay_excludingApplications_exceptingWindows(
                SCContentFilter::alloc(),
                &display,
                &NSArray::from_retained_slice(&own),
                &NSArray::<SCWindow>::new(),
            );
            let config = SCStreamConfiguration::new();
            config.setSourceRect(self.source);
            config.setWidth(self.width);
            config.setHeight(self.height);
            config.setShowsCursor(false);
            config.setCaptureResolution(SCCaptureResolutionType::Best);
            (filter, config)
        };

        let handler = RcBlock::new(move |image: *mut CGImage, error: *mut NSError| {
            let result = match NonNull::new(image) {
                // SAFETY: non-null CGImage provided by SCK, valid for the callback's duration.
                Some(image) => frame_from_image(unsafe { image.as_ref() }),
                None => Err(ns_error(error)),
            };
            let _ = tx.send(result);
        });
        // SAFETY: valid filter/config; block signature matches.
        unsafe {
            SCScreenshotManager::captureImageWithFilter_configuration_completionHandler(
                &filter,
                &config,
                Some(&handler),
            )
        };
        Ok(())
    }
}

/// Draws the CGImage into a tightly packed BGRA8 buffer (also normalizes the color format).
fn frame_from_image(image: &CGImage) -> Result<Frame, CaptureError> {
    let width = CGImage::width(Some(image));
    let height = CGImage::height(Some(image));
    if width == 0 || height == 0 {
        return Err(CaptureError::EmptySelection);
    }
    let stride = width * 4;
    let mut pixels = vec![0u8; stride * height];
    let space = CGColorSpace::new_device_rgb()
        .ok_or_else(|| CaptureError::Platform("no RGB color space".into()))?;
    let info = CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::NoneSkipFirst.0;
    // SAFETY: `pixels` outlives the context and is exactly `stride * height` bytes.
    let ctx = unsafe {
        CGBitmapContextCreate(
            pixels.as_mut_ptr().cast::<c_void>(),
            width,
            height,
            8,
            stride,
            Some(&space),
            info,
        )
    }
    .ok_or_else(|| CaptureError::Platform("bitmap context creation failed".into()))?;
    let bounds = CGRect::new(CGPoint::ZERO, CGSize::new(width as f64, height as f64));
    CGContext::draw_image(Some(&ctx), bounds, Some(image));
    drop(ctx);
    Ok(Frame {
        width: width as u32,
        height: height as u32,
        stride,
        pixels,
    })
}

fn ns_error(error: *mut NSError) -> CaptureError {
    // SAFETY: SCK passes a valid NSError or null.
    match unsafe { error.as_ref() } {
        Some(e) if e.code() == ERROR_USER_DECLINED => CaptureError::PermissionDenied,
        Some(e) => CaptureError::Platform(format!("{} ({})", e.localizedDescription(), e.code())),
        None => CaptureError::Platform("unknown ScreenCaptureKit error".into()),
    }
}
