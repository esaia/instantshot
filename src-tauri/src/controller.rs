//! Orchestrates one capture session: shortcut → overlays → region capture → then either
//! OCR → clipboard (text mode) or the screenshot editor (screenshot mode).
//!
//! Invariants:
//! - At most one session at a time (enforced by [`Workflow`]).
//! - Every path ends in [`end`], which hides overlays, restores focus (unless the editor took
//!   over) and resets the state machine, so a failure can never leave input-blocking windows
//!   behind.
//! - Overlays that fail to report ready within [`READY_TIMEOUT`] abort the session.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::display::{self, Display};
use crate::error::CaptureError;
use crate::geometry::Rect;
use crate::workflow::{CaptureMode, HotkeyAction, Outcome, Phase, Workflow};
use crate::{capture, editor, feedback, ocr, overlay, permissions, settings};

const READY_TIMEOUT: Duration = Duration::from_millis(2500);
/// Event telling already-loaded overlay pages that a new session started.
pub const EVENT_BEGIN: &str = "overlay:begin";
/// Event telling overlays the capture mode changed during selection.
const EVENT_MODE: &str = "overlay:mode";

/// What a screenshot selection should do once confirmed in the overlay.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FinishAction {
    /// Open the editor (also the default when no action is given).
    #[default]
    Edit,
    /// Copy the captured image without opening the editor.
    Copy,
}

#[derive(Default)]
pub struct CaptureController {
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    workflow: Workflow,
    displays: Vec<Display>,
    revealed: usize,
}

impl CaptureController {
    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        // A poisoned lock only means a panic elsewhere; the state itself stays consistent.
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Current session id if overlays should be showing.
    pub fn selecting_session(&self) -> Option<u64> {
        self.selecting().map(|(session, _)| session)
    }

    /// Current session and its capture mode while selecting.
    pub fn selecting(&self) -> Option<(u64, CaptureMode)> {
        let s = self.lock();
        (s.workflow.phase() == Phase::SelectingRegion)
            .then(|| (s.workflow.session(), s.workflow.mode()))
    }
}

/// Global shortcut / tray entry point. Runs on the main thread.
pub fn on_hotkey(app: &AppHandle, mode: CaptureMode) {
    let controller = app.state::<CaptureController>();
    let action = controller.lock().workflow.on_hotkey(mode);
    match action {
        HotkeyAction::Start(session) => start(app, session),
        HotkeyAction::Cancel(session) => cancel(app, session),
        HotkeyAction::Switched => {
            log::debug!("capture mode switched to {mode:?}");
            let _ = app.emit(EVENT_MODE, mode);
        }
        HotkeyAction::Ignore => log::debug!("capture already in progress; shortcut ignored"),
    }
}

fn start(app: &AppHandle, session: u64) {
    if permissions::screen_capture() == permissions::PermissionState::NotGranted {
        permissions::request_screen_capture();
        end(app, session, Outcome::PermissionDenied);
        return;
    }
    overlay::save_focus();
    editor::stash_for_capture(app);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let displays = display::list();
        if displays.is_empty() {
            end(
                &app,
                session,
                Outcome::CaptureFailed("No display found".into()),
            );
            return;
        }
        {
            let controller = app.state::<CaptureController>();
            let mut s = controller.lock();
            if s.workflow.session() != session || s.workflow.phase() != Phase::SelectingRegion {
                return;
            }
            s.displays = displays.clone();
            s.revealed = 0;
        }
        if let Err(err) = overlay::prepare(&app, &displays) {
            log::error!("overlay creation failed: {err}");
            end(
                &app,
                session,
                Outcome::CaptureFailed("Couldn't show the selection overlay".into()),
            );
            return;
        }
        let _ = app.emit(EVENT_BEGIN, session);

        tokio::time::sleep(READY_TIMEOUT).await;
        let stuck = {
            let controller = app.state::<CaptureController>();
            let s = controller.lock();
            s.workflow.session() == session
                && s.workflow.phase() == Phase::SelectingRegion
                && s.revealed == 0
        };
        if stuck {
            log::warn!("overlays did not become ready; aborting session {session}");
            end(
                &app,
                session,
                Outcome::CaptureFailed("The selection overlay didn't respond".into()),
            );
        }
    });
}

/// An overlay page reset its UI for `session` and is ready to be shown.
pub fn overlay_ready(app: &AppHandle, window: WebviewWindow, session: u64) {
    let controller = app.state::<CaptureController>();
    let (display, displays) = {
        let mut s = controller.lock();
        if s.workflow.session() != session || s.workflow.phase() != Phase::SelectingRegion {
            return;
        }
        let Some(display) = s
            .displays
            .iter()
            .find(|d| d.window_label() == window.label())
            .cloned()
        else {
            return;
        };
        s.revealed += 1;
        (display, s.displays.clone())
    };
    overlay::reveal(app, window, display, displays);
}

pub fn cancel(app: &AppHandle, session: u64) {
    let cancelled = app
        .state::<CaptureController>()
        .lock()
        .workflow
        .cancel(session);
    if cancelled {
        overlay::hide_all(app);
        editor::unstash_after_capture(app);
    }
}

/// Selection finished on `window`. Captures the region off the main thread, then hands it to the
/// text or screenshot flow.
pub async fn finish_selection(
    app: AppHandle,
    window_label: String,
    session: u64,
    rect: Rect,
    action: FinishAction,
) {
    let (display, mode) = {
        let controller = app.state::<CaptureController>();
        let mut s = controller.lock();
        let display = s
            .displays
            .iter()
            .find(|d| d.window_label() == window_label)
            .cloned();
        if display.is_none() || !s.workflow.begin_capture(session) {
            return;
        }
        (display.expect("checked above"), s.workflow.mode())
    };
    overlay::hide_overlays(&app);

    if !rect.normalized().is_selection() {
        end(&app, session, Outcome::Cancelled);
        return;
    }

    let outcome = match mode {
        CaptureMode::Text => text_flow(&app, session, display, rect).await,
        CaptureMode::Screenshot => screenshot_flow(&app, session, display, rect, action).await,
    };
    end(&app, session, outcome);
}

/// Capture → OCR → clipboard.
async fn text_flow(app: &AppHandle, session: u64, display: Display, rect: Rect) -> Outcome {
    let options = settings::ocr_options(app);
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let frame = capture::capture_region(&display, rect).map_err(capture_outcome)?;
        let captured = started.elapsed();
        let controller = worker_app.state::<CaptureController>();
        if !controller.lock().workflow.begin_ocr(session) {
            return Err(Outcome::Cancelled);
        }
        let text = ocr::recognize_text(&frame, &options)
            .map_err(|e| Outcome::OcrFailed(e.user_message()))?;
        log::info!(
            "capture {}x{} px in {:?}, OCR in {:?}",
            frame.width,
            frame.height,
            captured,
            started.elapsed() - captured
        );
        Ok(text)
    })
    .await;

    match result {
        Ok(Ok(text)) if text.trim().is_empty() => Outcome::NoTextFound,
        Ok(Ok(text)) => copy(app, session, text),
        Ok(Err(outcome)) => outcome,
        Err(err) => {
            log::error!("capture worker failed: {err}");
            Outcome::CaptureFailed("Something went wrong".into())
        }
    }
}

/// Capture → screenshot editor, or straight to the clipboard.
async fn screenshot_flow(
    app: &AppHandle,
    session: u64,
    display: Display,
    rect: Rect,
    action: FinishAction,
) -> Outcome {
    let worker_display = display.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let frame = capture::capture_region(&worker_display, rect).map_err(capture_outcome)?;
        Ok::<_, Outcome>(editor::EditorImage::from_frame(
            &frame,
            worker_display.scale,
        ))
    })
    .await;

    let image = match result {
        Ok(Ok(image)) => image,
        Ok(Err(outcome)) => return outcome,
        Err(err) => {
            log::error!("capture worker failed: {err}");
            return Outcome::CaptureFailed("Something went wrong".into());
        }
    };
    if action == FinishAction::Copy {
        return copy_image(app, session, image);
    }
    if !app
        .state::<CaptureController>()
        .lock()
        .workflow
        .begin_editor(session)
    {
        return Outcome::Cancelled;
    }
    match editor::open(app, image, &display) {
        Ok(()) => Outcome::EditorOpened,
        Err(err) => {
            log::error!("opening the editor failed: {err}");
            Outcome::CaptureFailed("Couldn't open the editor".into())
        }
    }
}

fn copy(app: &AppHandle, session: u64, text: String) -> Outcome {
    if !app
        .state::<CaptureController>()
        .lock()
        .workflow
        .begin_copy(session)
    {
        return Outcome::Cancelled;
    }
    let chars = text.chars().count();
    match app.clipboard().write_text(text) {
        Ok(()) => Outcome::Completed { chars },
        Err(err) => {
            log::error!("clipboard write failed: {err}");
            Outcome::ClipboardFailed
        }
    }
}

fn copy_image(app: &AppHandle, session: u64, image: editor::EditorImage) -> Outcome {
    if !app
        .state::<CaptureController>()
        .lock()
        .workflow
        .begin_image_copy(session)
    {
        return Outcome::Cancelled;
    }
    let image = tauri::image::Image::new_owned(image.rgba, image.width, image.height);
    match app.clipboard().write_image(&image) {
        Ok(()) => Outcome::ImageCopied,
        Err(err) => {
            log::error!("clipboard image write failed: {err}");
            Outcome::ClipboardFailed
        }
    }
}

fn capture_outcome(err: CaptureError) -> Outcome {
    match err {
        CaptureError::PermissionDenied => Outcome::PermissionDenied,
        CaptureError::EmptySelection => Outcome::Cancelled,
        other => {
            log::error!("capture failed: {other}");
            Outcome::CaptureFailed(other.user_message())
        }
    }
}

/// Terminal step for every session.
fn end(app: &AppHandle, session: u64, outcome: Outcome) {
    let ended = app
        .state::<CaptureController>()
        .lock()
        .workflow
        .finish(session);
    overlay::hide_overlays(app);
    if !outcome.keeps_focus() {
        overlay::restore_focus(app);
        editor::unstash_after_capture(app);
    }
    if !ended {
        return;
    }
    if outcome == Outcome::PermissionDenied {
        crate::show_settings(app);
    }
    feedback::show(app, &outcome);
}
