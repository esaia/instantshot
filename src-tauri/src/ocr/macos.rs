//! Apple Vision text recognition (`VNRecognizeTextRequest`). Runs synchronously on the calling
//! (background) thread; Vision performs all work locally.

use objc2::AllocAnyThread;
use objc2::rc::{Retained, autoreleasepool};
use objc2_core_foundation::CFData;
use objc2_core_graphics::{
    CGBitmapInfo, CGColorRenderingIntent, CGColorSpace, CGDataProvider, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo,
};
use objc2_foundation::{NSArray, NSDictionary, NSLocale, NSString};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};

use super::{LanguageStatus, OcrEngine, OcrOptions, TextBox};
use crate::capture::Frame;
use crate::error::OcrError;

#[derive(Default)]
pub struct VisionEngine;

impl OcrEngine for VisionEngine {
    fn recognize(&self, frame: &Frame, options: &OcrOptions) -> Result<Vec<TextBox>, OcrError> {
        autoreleasepool(|_| recognize(frame, options))
    }
}

fn recognize(frame: &Frame, options: &OcrOptions) -> Result<Vec<TextBox>, OcrError> {
    let image = cg_image(frame)?;
    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    // Raw recognition is more faithful for code, identifiers, URLs and accents; prose accuracy
    // was unchanged in our fixtures. We copy what is on screen rather than "corrected" text.
    request.setUsesLanguageCorrection(false);
    if options.auto_language {
        request.setAutomaticallyDetectsLanguage(true);
    } else {
        let languages = preferred_languages(&request);
        if !languages.is_empty() {
            let refs: Vec<&NSString> = languages.iter().map(|s| &**s).collect();
            request.setRecognitionLanguages(&NSArray::from_slice(&refs));
        }
    }

    // SAFETY: valid CGImage and an empty options dictionary.
    let handler = unsafe {
        VNImageRequestHandler::initWithCGImage_options(
            VNImageRequestHandler::alloc(),
            &image,
            &NSDictionary::new(),
        )
    };
    let base: &VNRequest = &request;
    handler
        .performRequests_error(&NSArray::from_slice(&[base]))
        .map_err(|e| OcrError::Platform(e.localizedDescription().to_string()))?;

    let (w, h) = (frame.width as f64, frame.height as f64);
    let boxes = request
        .results()
        .map(|results| {
            results
                .iter()
                .filter_map(|obs| {
                    let text = obs.topCandidates(1).firstObject()?.string().to_string();
                    // Normalized, bottom-left origin -> pixels, top-left origin.
                    // SAFETY: plain property read.
                    let bb = unsafe { obs.boundingBox() };
                    Some(TextBox {
                        text,
                        x: bb.origin.x * w,
                        y: (1.0 - bb.origin.y - bb.size.height) * h,
                        width: bb.size.width * w,
                        height: bb.size.height * h,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(boxes)
}

/// Wraps the BGRA frame as a CGImage (one copy into CFData).
fn cg_image(frame: &Frame) -> Result<objc2_core_foundation::CFRetained<CGImage>, OcrError> {
    let data = CFData::from_bytes(&frame.pixels);
    let provider = CGDataProvider::with_cf_data(Some(&data))
        .ok_or_else(|| OcrError::Platform("data provider".into()))?;
    let space =
        CGColorSpace::new_device_rgb().ok_or_else(|| OcrError::Platform("color space".into()))?;
    let info =
        CGBitmapInfo(CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::NoneSkipFirst.0);
    // SAFETY: dimensions/stride describe `frame.pixels` exactly; decode array is null.
    unsafe {
        CGImage::new(
            frame.width as usize,
            frame.height as usize,
            8,
            32,
            frame.stride,
            Some(&space),
            info,
            Some(&provider),
            std::ptr::null(),
            false,
            CGColorRenderingIntent::RenderingIntentDefault,
        )
    }
    .ok_or_else(|| OcrError::Platform("image creation".into()))
}

fn supported_languages(request: &VNRecognizeTextRequest) -> Vec<String> {
    // SAFETY: simple query on a configured request.
    unsafe { request.supportedRecognitionLanguagesAndReturnError() }
        .map(|langs| langs.iter().map(|s| s.to_string()).collect())
        .unwrap_or_default()
}

/// The user's preferred languages that Vision supports, in preference order.
fn preferred_languages(request: &VNRecognizeTextRequest) -> Vec<Retained<NSString>> {
    let supported = supported_languages(request);
    let mut out: Vec<String> = Vec::new();
    for pref in NSLocale::preferredLanguages().iter() {
        let pref = pref.to_string();
        let primary = pref.split(['-', '_']).next().unwrap_or("").to_lowercase();
        let hit = supported
            .iter()
            .find(|s| s.eq_ignore_ascii_case(&pref))
            .or_else(|| {
                supported.iter().find(|s| {
                    s.split(['-', '_'])
                        .next()
                        .unwrap_or("")
                        .eq_ignore_ascii_case(&primary)
                })
            });
        if let Some(lang) = hit {
            if !out.contains(lang) {
                out.push(lang.clone());
            }
        }
    }
    out.iter().map(|s| NSString::from_str(s)).collect()
}

pub fn language_status() -> LanguageStatus {
    autoreleasepool(|_| {
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        let languages = supported_languages(&request);
        LanguageStatus {
            available: !languages.is_empty(),
            languages,
        }
    })
}
