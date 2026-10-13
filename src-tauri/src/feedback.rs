//! Subtle HUD feedback ("Copied 42 characters", "No text found"). A small click-through window
//! that never takes focus, shown near the bottom of the display under the pointer.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::geometry::Rect;
use crate::workflow::Outcome;
use crate::{display, overlay, settings};

pub const TOAST_LABEL: &str = "toast";
const EVENT_SHOW: &str = "toast:show";
const WIDTH: f64 = 280.0;
const HEIGHT: f64 = 44.0;
const BOTTOM_MARGIN: f64 = 120.0;
const SUCCESS_DURATION: Duration = Duration::from_millis(1400);
const ERROR_DURATION: Duration = Duration::from_millis(2600);

static GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToastPayload {
    message: String,
    success: bool,
}

pub fn show(app: &AppHandle, outcome: &Outcome) {
    let Some(message) = outcome.message() else {
        return;
    };
    let success = outcome.is_success();
    if success && !settings::get(app).show_notification {
        return;
    }
    if !success {
        log::info!("capture ended: {message}");
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let window = match app.get_webview_window(TOAST_LABEL) {
            Some(w) => w,
            None => match build(&app) {
                Ok(w) => {
                    // Give a freshly created page time to load and subscribe.
                    tokio::time::sleep(Duration::from_millis(400)).await;
                    w
                }
                Err(err) => {
                    log::error!("toast window creation failed: {err}");
                    return;
                }
            },
        };
        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = window.emit_to(TOAST_LABEL, EVENT_SHOW, ToastPayload { message, success });
        // Let the page render the new message before it becomes visible.
        tokio::time::sleep(Duration::from_millis(30)).await;

        let displays = display::list();
        let target = overlay::cursor_display(&app, &displays)
            .await
            .and_then(|id| displays.iter().find(|d| d.id == id).cloned())
            .or_else(|| displays.first().cloned());
        let Some(target) = target else { return };
        let d = target.logical;
        let frame = Rect::new(
            d.x + (d.width - WIDTH) / 2.0,
            d.y + d.height - HEIGHT - BOTTOM_MARGIN,
            WIDTH,
            HEIGHT,
        );
        overlay::show_hud(&app, window.clone(), target, frame);

        tokio::time::sleep(if success {
            SUCCESS_DURATION
        } else {
            ERROR_DURATION
        })
        .await;
        if GENERATION.load(Ordering::SeqCst) == generation {
            let _ = window.hide();
        }
    });
}

fn build(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, TOAST_LABEL, WebviewUrl::App("index.html".into()))
        .title("TextPicker")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .inner_size(WIDTH, HEIGHT)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    Ok(window)
}
