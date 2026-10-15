//! Update checks against the latest GitHub release (`latest.json`, see tauri.conf.json).
//!
//! Checks quietly shortly after launch and then once a day; "Check for Updates…" in the tray
//! menu or Settings checks on demand and also reports "up to date" and errors. Installing always
//! asks first, then restarts into the new version.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK_DELAY: Duration = Duration::from_secs(10);
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Set while a check, prompt or download is in progress, so two never overlap.
static BUSY: AtomicBool = AtomicBool::new(false);

/// Starts the background checks. Skipped in debug builds so development runs never prompt.
pub fn start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK_DELAY).await;
        loop {
            check(&app, false).await;
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

/// Checks on demand and tells the user the outcome either way.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { check(&app, true).await });
}

async fn check(app: &AppHandle, interactive: bool) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Err(err) = run(app, interactive).await {
        log::warn!("update check failed: {err}");
        if interactive {
            message(
                app,
                MessageDialogKind::Error,
                "Couldn’t Check for Updates",
                format!("{err}\n\nCheck your internet connection and try again."),
            )
            .await;
        }
    }
    BUSY.store(false, Ordering::SeqCst);
}

async fn run(app: &AppHandle, interactive: bool) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        log::info!("no update available");
        if interactive {
            let version = app.package_info().version.to_string();
            message(
                app,
                MessageDialogKind::Info,
                "You’re Up to Date",
                format!("InstantShot {version} is the latest version."),
            )
            .await;
        }
        return Ok(());
    };

    log::info!("update available: {}", update.version);
    let notes = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|b| !b.is_empty())
        .map(|b| format!("\n\n{b}"))
        .unwrap_or_default();
    let text = format!(
        "InstantShot {} is available. You have {}.{notes}",
        update.version, update.current_version
    );
    let dialog = app
        .dialog()
        .message(text)
        .title("Update Available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Restart".into(),
            "Later".into(),
        ));
    let install = tauri::async_runtime::spawn_blocking(move || dialog.blocking_show())
        .await
        .unwrap_or(false);
    if !install {
        return Ok(());
    }

    update.download_and_install(|_, _| {}, || {}).await?;
    log::info!("update installed; restarting");
    // On Windows the installer has already closed the app; this only runs on macOS.
    app.restart();
}

async fn message(app: &AppHandle, kind: MessageDialogKind, title: &str, text: String) {
    let dialog = app.dialog().message(text).title(title).kind(kind);
    let _ = tauri::async_runtime::spawn_blocking(move || dialog.blocking_show()).await;
}
