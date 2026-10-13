//! Selection overlay windows: one borderless, transparent, always-on-top webview per display.
//!
//! Windows are created lazily on the first capture and then hidden (not destroyed) so later
//! activations are instant. The pool is reconciled with the current display list on every
//! capture, which handles monitors being added or removed without any polling.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::display::{Display, OVERLAY_LABEL_PREFIX};
use crate::geometry::Rect;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use self::windows as platform;
#[cfg(windows)]
pub use self::windows::exclusion_supported;

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    use super::*;
    pub fn configure(_: &WebviewWindow) {}
    pub fn reveal(w: &WebviewWindow, _: &Display, key: bool) {
        let _ = w.show();
        if key {
            let _ = w.set_focus();
        }
    }
    pub fn cursor_display(_: &[Display]) -> Option<String> {
        None
    }
    pub fn save_focus() {}
    pub fn restore_focus() {}
    pub fn show_hud(w: &WebviewWindow, _: &Display, frame: Rect) {
        let _ = w.set_position(tauri::LogicalPosition::new(frame.x, frame.y));
        let _ = w.show();
    }
}

pub fn is_overlay(label: &str) -> bool {
    label.starts_with(OVERLAY_LABEL_PREFIX)
}

pub fn overlays(app: &AppHandle) -> Vec<WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| is_overlay(label))
        .map(|(_, w)| w)
        .collect()
}

/// Ensures exactly one overlay window exists per display. Must not run on the main thread on
/// Windows (window creation waits for the event loop).
pub fn prepare(app: &AppHandle, displays: &[Display]) -> tauri::Result<()> {
    for window in overlays(app) {
        if !displays.iter().any(|d| d.window_label() == window.label()) {
            let _ = window.destroy();
        }
    }
    for display in displays {
        let label = display.window_label();
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("TextPicker Selection")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible_on_all_workspaces(true)
            .accept_first_mouse(true)
            .focused(false)
            .visible(false)
            .position(display.logical.x, display.logical.y)
            .inner_size(display.logical.width, display.logical.height)
            .build()?;
        app.run_on_main_thread(move || platform::configure(&window))?;
    }
    Ok(())
}

/// Positions and shows the overlay for `display`. The overlay under the cursor becomes key so it
/// receives Escape. Runs the native work on the main thread.
pub fn reveal(app: &AppHandle, window: WebviewWindow, display: Display, displays: Vec<Display>) {
    let _ = app.run_on_main_thread(move || {
        let key = match platform::cursor_display(&displays) {
            Some(id) => id == display.id,
            None => displays.first().map(|d| d.id == display.id).unwrap_or(true),
        };
        platform::reveal(&window, &display, key);
    });
}

/// Hides every overlay immediately and returns focus to the previously active app.
pub fn hide_all(app: &AppHandle) {
    for window in overlays(app) {
        let _ = window.hide();
    }
    let _ = app.run_on_main_thread(platform::restore_focus);
}

/// Remembers the frontmost application so focus can be restored after capture. Main thread.
pub fn save_focus() {
    platform::save_focus();
}

/// Id of the display under the mouse pointer (queried on the main thread).
pub async fn cursor_display(app: &AppHandle, displays: &[Display]) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let displays = displays.to_vec();
    app.run_on_main_thread(move || {
        let _ = tx.send(platform::cursor_display(&displays));
    })
    .ok()?;
    rx.await.ok().flatten()
}

/// Shows a non-activating HUD window at `frame` (global logical coordinates on `display`).
pub fn show_hud(app: &AppHandle, window: WebviewWindow, display: Display, frame: Rect) {
    let _ = app.run_on_main_thread(move || platform::show_hud(&window, &display, frame));
}
