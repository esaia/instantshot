//! Screenshot editor window. Rust keeps the captured pixels; the editor page fetches them as raw
//! bytes, composes the final image (background, frame, annotations) in a canvas, and sends PNGs
//! back for export (see [`crate::export`]).
//!
//! The window is preloaded hidden shortly after launch and hidden (not destroyed) on close, so a
//! screenshot opens instantly; closing releases the image.
//! While it is open on macOS the app switches to a regular activation policy so the editor shows
//! up in Cmd-Tab and the Dock like any document window.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::capture::Frame;
use crate::display::Display;
use crate::geometry::Rect;
use crate::{export, overlay};

pub const EDITOR_LABEL: &str = "editor";
/// Tells an already-open editor page to fetch a new image.
const EVENT_LOAD: &str = "editor:load";
/// Tells the page the window was hidden, so it can drop the image.
const EVENT_HIDDEN: &str = "editor:hidden";
/// Show the window even if the page never reports ready (e.g. a script error).
const READY_FALLBACK: Duration = Duration::from_millis(1000);

const SIDEBAR_WIDTH: f64 = 288.0;
const TOOLBAR_HEIGHT: f64 = 52.0;
const MIN_SIZE: (f64, f64) = (900.0, 620.0);
const MIN_RESIZE: (f64, f64) = (820.0, 560.0);
/// Largest share of the display the initial window may cover.
const MAX_SHARE: f64 = 0.88;

/// A captured screenshot as tightly packed RGBA8.
pub struct EditorImage {
    pub width: u32,
    pub height: u32,
    /// Backing scale factor of the captured display (pixels per logical unit).
    pub scale: f64,
    pub rgba: Vec<u8>,
    /// Annotations drawn in the selection overlay (opaque JSON for the editor page, geometry in
    /// logical px relative to the selection).
    pub markup: Vec<serde_json::Value>,
}

impl EditorImage {
    pub fn from_frame(frame: &Frame, scale: f64) -> Self {
        Self {
            width: frame.width,
            height: frame.height,
            scale: if scale.is_finite() && scale > 0.0 {
                scale
            } else {
                1.0
            },
            rgba: bgra_to_rgba(frame),
            markup: Vec::new(),
        }
    }

    /// Draws a straight-alpha RGBA `layer` (the overlay's annotations) over the image. The layer
    /// is stretched to the image size (nearest pixel), which absorbs rounding differences.
    pub fn composite(&mut self, layer: &[u8], layer_w: u32, layer_h: u32) {
        let (w, h) = (self.width as usize, self.height as usize);
        let (lw, lh) = (layer_w as usize, layer_h as usize);
        if lw == 0 || lh == 0 || layer.len() < lw * lh * 4 {
            return;
        }
        for y in 0..h {
            let ly = (y * lh / h).min(lh - 1);
            for x in 0..w {
                let lx = (x * lw / w).min(lw - 1);
                let src = &layer[(ly * lw + lx) * 4..][..4];
                let a = src[3] as u32;
                if a == 0 {
                    continue;
                }
                let dst = &mut self.rgba[(y * w + x) * 4..][..4];
                for c in 0..3 {
                    dst[c] = ((src[c] as u32 * a + dst[c] as u32 * (255 - a) + 127) / 255) as u8;
                }
            }
        }
    }

    fn logical_size(&self) -> (f64, f64) {
        (
            self.width as f64 / self.scale,
            self.height as f64 / self.scale,
        )
    }
}

#[derive(Default)]
pub struct EditorState(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    image: Option<Arc<EditorImage>>,
    /// A screenshot is waiting for the page to paint before the window is shown.
    pending_reveal: bool,
    /// Windows (editor, settings) that were open behind other apps and are hidden while a
    /// capture runs.
    stashed: Vec<&'static str>,
}

impl EditorState {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Converts a BGRA frame (rows may be padded, alpha undefined) into packed, opaque RGBA.
pub fn bgra_to_rgba(frame: &Frame) -> Vec<u8> {
    let (w, h) = (frame.width as usize, frame.height as usize);
    let mut out = Vec::with_capacity(w * h * 4);
    for row in frame.pixels.chunks(frame.stride).take(h) {
        for px in row[..w * 4].chunks_exact(4) {
            out.extend_from_slice(&[px[2], px[1], px[0], 255]);
        }
    }
    out
}

/// Wire format shared with `src/editor/lib/rawFrame.ts`: `u32 width`, `u32 height`, `f32 scale`
/// (all little-endian), followed by `width * height * 4` RGBA bytes.
pub fn encode_raw(width: u32, height: u32, scale: f64, rgba: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(12 + rgba.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(&(scale as f32).to_le_bytes());
    out.extend_from_slice(rgba);
    out
}

/// Initial editor window frame (logical units): roomy enough for the image plus the sidebar and
/// toolbar, at least [`MIN_SIZE`], at most [`MAX_SHARE`] of `area`, centered in `area`.
pub fn window_frame(image: (f64, f64), area: Rect) -> Rect {
    let max_w = (area.width * MAX_SHARE).max(MIN_RESIZE.0);
    let max_h = (area.height * MAX_SHARE).max(MIN_RESIZE.1);
    let width = (image.0 * 1.15 + SIDEBAR_WIDTH).clamp(MIN_SIZE.0.min(max_w), max_w);
    let height = (image.1 * 1.15 + TOOLBAR_HEIGHT + 48.0).clamp(MIN_SIZE.1.min(max_h), max_h);
    Rect::new(
        (area.x + (area.width - width) / 2.0).round(),
        (area.y + (area.height - height) / 2.0).round(),
        width.round(),
        height.round(),
    )
}

/// Stores `image` and shows it in the editor. The window is normally preloaded (see
/// [`preload`]), so this only resizes it and asks the page to fetch the image; the page calls
/// `editor_ready` once it has painted, which reveals the window. Must not run on the main thread
/// on Windows (window creation waits for the event loop).
pub fn open(app: &AppHandle, image: EditorImage, display: &Display) -> tauri::Result<()> {
    let frame = window_frame(image.logical_size(), display.logical);
    {
        let state = app.state::<EditorState>();
        let mut inner = state.lock();
        inner.image = Some(Arc::new(image));
        inner.pending_reveal = true;
        // The editor is about to be shown anyway; other stashed windows go back behind it.
        let others: Vec<_> = std::mem::take(&mut inner.stashed)
            .into_iter()
            .filter(|label| *label != EDITOR_LABEL)
            .collect();
        drop(inner);
        order_back_all(app, others);
    }

    match app.get_webview_window(EDITOR_LABEL) {
        Some(window) => {
            if !window.is_visible().unwrap_or(false) {
                place(&window, frame, display);
            }
            let _ = window.emit_to(EDITOR_LABEL, EVENT_LOAD, ());
        }
        None => {
            let window = build(app)?;
            place(&window, frame, display);
        }
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(READY_FALLBACK).await;
        if app.state::<EditorState>().lock().pending_reveal {
            log::warn!("editor page did not report ready; showing it anyway");
            reveal(&app);
        }
    });
    Ok(())
}

/// Creates the hidden editor window ahead of time, so the first screenshot opens instantly.
pub fn preload(app: &AppHandle) {
    if app.get_webview_window(EDITOR_LABEL).is_none() {
        if let Err(err) = build(app) {
            log::warn!("editor preload failed: {err}");
        }
    }
}

fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let builder =
        WebviewWindowBuilder::new(app, EDITOR_LABEL, WebviewUrl::App("index.html".into()))
            .title("InstantShot")
            .inner_size(MIN_SIZE.0, MIN_SIZE.1)
            .min_inner_size(MIN_RESIZE.0, MIN_RESIZE.1)
            .resizable(true)
            .visible(false)
            .focused(false);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        // `y` sets the title bar height below the buttons, not their center; 29 centers them
        // in the 52 px toolbar.
        .traffic_light_position(tauri::LogicalPosition::new(20.0, 29.0));
    builder.build()
}

/// Sizes the window for the new image and centers it on the captured display.
fn place(window: &WebviewWindow, frame: Rect, display: &Display) {
    #[cfg(target_os = "macos")]
    {
        let _ = display;
        let _ = window.set_size(tauri::LogicalSize::new(frame.width, frame.height));
        let _ = window.set_position(tauri::LogicalPosition::new(frame.x, frame.y));
    }
    // Windows: logical positions use the primary monitor's scale, so place the window in
    // physical pixels on the captured display instead.
    #[cfg(not(target_os = "macos"))]
    {
        let s = display.scale;
        let (w, h) = (frame.width * s, frame.height * s);
        let x = display.physical_x as f64 + (display.physical_width as f64 - w) / 2.0;
        let y = display.physical_y as f64 + (display.physical_height as f64 - h) / 2.0;
        let _ = window.set_size(tauri::PhysicalSize::new(w.round() as u32, h.round() as u32));
        let _ = window.set_position(tauri::PhysicalPosition::new(
            x.round() as i32,
            y.round() as i32,
        ));
    }
}

/// The page painted the new image: show the window if a screenshot is waiting for it.
pub fn page_ready(app: &AppHandle) {
    let pending = std::mem::take(&mut app.state::<EditorState>().lock().pending_reveal);
    if pending {
        reveal(app);
    }
}

/// Shows and focuses the editor (main thread).
fn reveal(app: &AppHandle) {
    app.state::<EditorState>().lock().pending_reveal = false;
    let Some(window) = app.get_webview_window(EDITOR_LABEL) else {
        return;
    };
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        let _ = handle.set_activation_policy(tauri::ActivationPolicy::Regular);
        #[cfg(not(target_os = "macos"))]
        let _ = &handle;
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    });
}

/// Called when a capture starts (main thread). Activating InstantShot for the selection overlay
/// would pull its windows that sit behind other apps (editor, settings) to the front, so hide
/// them for the capture.
pub fn stash_for_capture(app: &AppHandle) {
    if app_is_active() {
        return;
    }
    let mut stashed = Vec::new();
    for label in [EDITOR_LABEL, crate::SETTINGS_LABEL] {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
            stashed.push(label);
        }
    }
    app.state::<EditorState>().lock().stashed = stashed;
}

/// Called when a capture ends without opening the editor: put stashed windows back behind the
/// app that regains focus, where they were before.
pub fn unstash_after_capture(app: &AppHandle) {
    let stashed = std::mem::take(&mut app.state::<EditorState>().lock().stashed);
    order_back_all(app, stashed);
}

fn order_back_all(app: &AppHandle, labels: Vec<&'static str>) {
    let windows: Vec<_> = labels
        .into_iter()
        .filter_map(|label| app.get_webview_window(label))
        .collect();
    if windows.is_empty() {
        return;
    }
    // Queued after the focus restore, so the other app is already in front.
    let _ = app.run_on_main_thread(move || windows.iter().for_each(order_back));
}

#[cfg(target_os = "macos")]
fn app_is_active() -> bool {
    objc2::MainThreadMarker::new()
        .map(|mtm| objc2_app_kit::NSApplication::sharedApplication(mtm).isActive())
        .unwrap_or(true)
}

#[cfg(not(target_os = "macos"))]
fn app_is_active() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn order_back(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else { return };
    // SAFETY: Tauri returns a valid NSWindow pointer that lives as long as the window.
    if let Some(ns) = unsafe { ptr.cast::<objc2_app_kit::NSWindow>().as_ref() } {
        ns.orderBack(None);
    }
}

#[cfg(not(target_os = "macos"))]
fn order_back(window: &WebviewWindow) {
    let _ = window.show();
}

/// Annotations that came with the current image (see [`EditorImage::markup`]).
pub fn current_markup(app: &AppHandle) -> Vec<serde_json::Value> {
    app.state::<EditorState>()
        .lock()
        .image
        .as_ref()
        .map(|image| image.markup.clone())
        .unwrap_or_default()
}

/// The current image in the wire format of [`encode_raw`].
pub fn current_image(app: &AppHandle) -> Option<Vec<u8>> {
    let image = app.state::<EditorState>().lock().image.clone()?;
    Some(encode_raw(
        image.width,
        image.height,
        image.scale,
        &image.rgba,
    ))
}

/// The user closed the editor: hide it (kept for the next screenshot), free the image, clean up,
/// and hand focus back.
pub fn close(app: &AppHandle, window: &tauri::Window) {
    let _ = window.hide();
    {
        let state = app.state::<EditorState>();
        let mut inner = state.lock();
        inner.image = None;
        inner.pending_reveal = false;
    }
    let _ = window.emit_to(EDITOR_LABEL, EVENT_HIDDEN, ());
    export::clear_drag_dir(app);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        #[cfg(not(target_os = "macos"))]
        let _ = &handle;
    });
    overlay::restore_focus(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn composites_layer_with_alpha_and_stretches_it() {
        let mut image = EditorImage {
            width: 2,
            height: 2,
            scale: 2.0,
            rgba: [10, 20, 30, 255].repeat(4),
            markup: Vec::new(),
        };
        // 1×1 layer: half-transparent white covers every pixel.
        image.composite(&[255, 255, 255, 128], 1, 1);
        assert_eq!(&image.rgba[..4], &[133, 138, 143, 255]);
        assert_eq!(&image.rgba[12..], &[133, 138, 143, 255]);
        // Transparent or malformed layers leave the image untouched.
        let before = image.rgba.clone();
        image.composite(&[0, 0, 0, 0], 1, 1);
        image.composite(&[1, 2], 1, 1);
        assert_eq!(image.rgba, before);
    }

    #[test]
    fn converts_bgra_with_padding_and_forces_opaque_alpha() {
        // 2x2 image, stride 12 (4 bytes padding per row).
        let frame = Frame {
            width: 2,
            height: 2,
            stride: 12,
            pixels: vec![
                1, 2, 3, 0, 4, 5, 6, 0, 99, 99, 99, 99, //
                7, 8, 9, 0, 10, 11, 12, 0, 99, 99, 99, 99,
            ],
        };
        assert_eq!(
            bgra_to_rgba(&frame),
            vec![
                3, 2, 1, 255, 6, 5, 4, 255, //
                9, 8, 7, 255, 12, 11, 10, 255
            ]
        );
    }

    #[test]
    fn raw_encoding_has_header_then_pixels() {
        let raw = encode_raw(3, 1, 2.0, &[0; 12]);
        assert_eq!(raw.len(), 24);
        assert_eq!(u32::from_le_bytes(raw[0..4].try_into().unwrap()), 3);
        assert_eq!(u32::from_le_bytes(raw[4..8].try_into().unwrap()), 1);
        assert_eq!(f32::from_le_bytes(raw[8..12].try_into().unwrap()), 2.0);
    }

    #[test]
    fn small_images_get_the_minimum_window_centered() {
        let area = Rect::new(100.0, 0.0, 1920.0, 1080.0);
        let f = window_frame((200.0, 100.0), area);
        assert_eq!((f.width, f.height), MIN_SIZE);
        assert_eq!(f.x, 100.0 + (1920.0 - 900.0) / 2.0);
        assert_eq!(f.y, ((1080.0 - 620.0) / 2.0_f64).round());
    }

    #[test]
    fn large_images_are_clamped_to_the_display() {
        let area = Rect::new(0.0, 0.0, 1440.0, 900.0);
        let f = window_frame((1440.0, 900.0), area);
        assert_eq!(f.width, (1440.0 * MAX_SHARE).round());
        assert_eq!(f.height, (900.0 * MAX_SHARE).round());
    }

    #[test]
    fn tiny_displays_still_fit_the_resize_minimum() {
        let f = window_frame((2000.0, 2000.0), Rect::new(0.0, 0.0, 800.0, 600.0));
        assert_eq!((f.width, f.height), MIN_RESIZE);
    }
}
