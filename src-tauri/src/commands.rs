//! Tauri commands. Kept thin: they validate input and delegate to the owning module.

use serde::Serialize;
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

use crate::controller::{self, CaptureController, FinishAction, Markup};
use crate::error::AppError;
use crate::geometry::Rect;
use crate::ocr::{self, LanguageStatus};
use crate::permissions::{self, PermissionState};
use crate::settings::{self, Settings};
use crate::workflow::CaptureMode;
use crate::{editor, export, overlay, shortcuts, wallpapers};

const TEXT_CAPTURE: &str = "Capture Text";
const SCREENSHOT_CAPTURE: &str = "Capture Screenshot";

// ---- Overlay ----

#[derive(Serialize)]
pub struct OverlaySession {
    session: u64,
    mode: CaptureMode,
}

/// Returns the session the overlay should display, or `None` if no selection is active.
#[tauri::command]
pub fn overlay_session(app: AppHandle) -> Option<OverlaySession> {
    app.state::<CaptureController>()
        .selecting()
        .map(|(session, mode)| OverlaySession { session, mode })
}

/// The frozen screen behind this overlay as raw RGBA; an error when it isn't frozen (the
/// overlay then stays see-through).
#[tauri::command]
pub async fn overlay_frame(app: AppHandle, window: WebviewWindow) -> Result<Response, AppError> {
    if !overlay::is_overlay(window.label()) {
        return Err(AppError::msg("Not an overlay"));
    }
    controller::frozen_image(&app, window.label())
        .await
        .map(Response::new)
        .ok_or_else(|| AppError::msg("The screen isn't frozen"))
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle, window: WebviewWindow, session: u64) {
    if overlay::is_overlay(window.label()) {
        controller::overlay_ready(&app, window, session);
    }
}

#[tauri::command]
pub async fn finish_selection(
    app: AppHandle,
    window: WebviewWindow,
    session: u64,
    rect: Rect,
    action: Option<FinishAction>,
    markup: Option<Markup>,
) {
    if overlay::is_overlay(window.label()) {
        let label = window.label().to_string();
        let action = action.unwrap_or_default();
        let markup = markup.unwrap_or_default();
        controller::finish_selection(app, label, session, rect, action, markup).await;
    }
}

#[tauri::command]
pub fn cancel_capture(app: AppHandle, session: u64) {
    controller::cancel(&app, session);
}

// ---- Settings ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    os: String,
    platform: &'static str,
    default_shortcut: &'static str,
    /// False if the saved shortcut couldn't be registered (e.g. taken by another app).
    shortcut_registered: bool,
    default_screenshot_shortcut: &'static str,
    screenshot_shortcut_registered: bool,
    /// Where quick saves go (resolved: the configured folder or the Desktop).
    save_folder: Option<String>,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let current = settings::get(&app);
    AppInfo {
        version: app.package_info().version.to_string(),
        os: os_description(),
        platform: std::env::consts::OS,
        default_shortcut: settings::DEFAULT_SHORTCUT,
        shortcut_registered: shortcuts::is_registered(&app, &current.shortcut),
        default_screenshot_shortcut: settings::DEFAULT_SCREENSHOT_SHORTCUT,
        screenshot_shortcut_registered: shortcuts::is_registered(
            &app,
            &current.screenshot_shortcut,
        ),
        save_folder: settings::save_folder(&app).map(|p| p.display().to_string()),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    settings::get(&app)
}

/// Saves everything except the shortcuts and save folder, which have their own commands.
#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, AppError> {
    let current = settings::get(&app);
    let mut next = settings;
    next.shortcut = current.shortcut;
    next.screenshot_shortcut = current.screenshot_shortcut;
    next.save_folder = current.save_folder;
    settings::save(&app, next.clone()).map_err(|e| {
        log::error!("saving settings failed: {e}");
        AppError::msg("Couldn't save settings")
    })?;
    Ok(next)
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, shortcut: String) -> Result<Settings, AppError> {
    let mut current = settings::get(&app);
    shortcuts::ensure_distinct(&shortcut, &current.screenshot_shortcut, SCREENSHOT_CAPTURE)
        .map_err(AppError::Message)?;
    shortcuts::replace(&app, Some(&current.shortcut), &shortcut).map_err(AppError::Message)?;
    current.shortcut = shortcut;
    save(&app, current)
}

#[tauri::command]
pub fn set_screenshot_shortcut(app: AppHandle, shortcut: String) -> Result<Settings, AppError> {
    let mut current = settings::get(&app);
    shortcuts::ensure_distinct(&shortcut, &current.shortcut, TEXT_CAPTURE)
        .map_err(AppError::Message)?;
    shortcuts::replace(&app, Some(&current.screenshot_shortcut), &shortcut)
        .map_err(AppError::Message)?;
    current.screenshot_shortcut = shortcut;
    save(&app, current)
}

/// Lets the user pick the quick-save folder. Unchanged if the dialog is cancelled.
#[tauri::command]
pub async fn choose_save_folder(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Settings, AppError> {
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Choose Where to Save Screenshots");
    if let Some(dir) = settings::save_folder(&app) {
        dialog = dialog.set_directory(dir);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok());
    let mut current = settings::get(&app);
    let Some(folder) = picked else {
        return Ok(current);
    };
    current.save_folder = Some(folder.display().to_string());
    save(&app, current)
}

#[tauri::command]
pub fn reset_save_folder(app: AppHandle) -> Result<Settings, AppError> {
    let mut current = settings::get(&app);
    current.save_folder = None;
    save(&app, current)
}

fn save(app: &AppHandle, next: Settings) -> Result<Settings, AppError> {
    settings::save(app, next.clone()).map_err(|_| AppError::msg("Couldn't save settings"))?;
    Ok(next)
}

/// Pauses the capture shortcut while the user records a new one in Settings.
#[tauri::command]
pub fn set_shortcut_paused(app: AppHandle, paused: bool) {
    crate::set_shortcut_paused(&app, paused);
}

#[tauri::command]
pub fn get_launch_at_login(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<bool, AppError> {
    crate::set_launch_at_login(&app, enabled).map_err(|e| {
        log::error!("launch at login: {e}");
        AppError::msg("Couldn't change the login item")
    })?;
    Ok(enabled)
}

// ---- Screenshot editor ----

/// The captured screenshot as raw bytes (see [`editor::encode_raw`]).
#[tauri::command]
pub fn editor_image(app: AppHandle) -> Result<Response, AppError> {
    editor::current_image(&app)
        .map(Response::new)
        .ok_or_else(|| AppError::msg("No screenshot to edit"))
}

/// Annotations drawn in the overlay for the current screenshot.
#[tauri::command]
pub fn editor_markup(app: AppHandle) -> Vec<serde_json::Value> {
    editor::current_markup(&app)
}

/// The editor page painted the new screenshot: show the window.
#[tauri::command]
pub fn editor_ready(app: AppHandle, window: WebviewWindow) {
    if window.label() == editor::EDITOR_LABEL {
        editor::page_ready(&app);
    }
}

/// Copies the export and closes the editor; the HUD confirms the copy.
#[tauri::command]
pub async fn copy_image(
    app: AppHandle,
    window: tauri::Window,
    request: Request<'_>,
) -> Result<(), AppError> {
    export::copy_image(&app, &request).await?;
    editor::close(&app, &window);
    crate::feedback::show(&app, &crate::workflow::Outcome::ImageCopied);
    Ok(())
}

#[tauri::command]
pub async fn save_image(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<Option<String>, AppError> {
    export::save_image(&app, &window, &request).await
}

#[tauri::command]
pub async fn quick_save(app: AppHandle, request: Request<'_>) -> Result<String, AppError> {
    export::quick_save(&app, &request).await
}

#[tauri::command]
pub fn reveal_last_save(app: AppHandle) -> Result<(), AppError> {
    export::reveal_last_save(&app)
}

#[tauri::command]
pub async fn start_drag(
    app: AppHandle,
    window: WebviewWindow,
    request: Request<'_>,
) -> Result<(), AppError> {
    export::start_drag(&app, &window, &request).await
}

#[tauri::command]
pub fn list_system_wallpapers(app: AppHandle) -> Vec<wallpapers::Wallpaper> {
    wallpapers::list(&app)
}

#[tauri::command]
pub async fn wallpaper_image(
    app: AppHandle,
    id: String,
    max_px: u32,
) -> Result<Response, AppError> {
    tauri::async_runtime::spawn_blocking(move || wallpapers::image(&app, &id, max_px))
        .await
        .ok()
        .flatten()
        .map(Response::new)
        .ok_or_else(|| AppError::msg("Couldn't load the wallpaper"))
}

#[tauri::command]
pub fn get_editor_style(app: AppHandle) -> Option<serde_json::Value> {
    settings::editor_style(&app)
}

#[tauri::command]
pub fn set_editor_style(app: AppHandle, style: serde_json::Value) -> Result<(), AppError> {
    settings::save_editor_style(&app, style).map_err(|e| {
        log::warn!("saving editor style failed: {e}");
        AppError::msg("Couldn't save the style")
    })
}

// ---- Permissions / OCR status ----

#[tauri::command]
pub fn permission_status() -> PermissionState {
    permissions::screen_capture()
}

#[tauri::command]
pub fn request_permission() -> PermissionState {
    permissions::request_screen_capture();
    permissions::screen_capture()
}

#[tauri::command]
pub async fn ocr_language_status() -> LanguageStatus {
    tauri::async_runtime::spawn_blocking(ocr::language_status)
        .await
        .unwrap_or(LanguageStatus {
            available: false,
            languages: Vec::new(),
        })
}

#[tauri::command]
pub fn open_permission_settings(app: AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let Some(url) = permissions::SETTINGS_URL else {
        return Ok(());
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| AppError::msg("Couldn't open System Settings"))
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

/// Checks for a new version; the outcome is shown in native dialogs.
#[tauri::command]
pub fn check_for_updates(app: AppHandle) {
    crate::updater::check_now(&app);
}

fn os_description() -> String {
    #[cfg(target_os = "macos")]
    {
        let v = objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion();
        format!(
            "macOS {}.{}.{} ({})",
            v.majorVersion,
            v.minorVersion,
            v.patchVersion,
            std::env::consts::ARCH
        )
    }
    #[cfg(windows)]
    {
        use windows::Wdk::System::SystemServices::RtlGetVersion;
        use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
        let mut v = OSVERSIONINFOW {
            dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
            ..Default::default()
        };
        // SAFETY: valid, correctly sized out-structure. Unlike GetVersionEx, this isn't shimmed.
        let _ = unsafe { RtlGetVersion(&mut v) };
        let name = if v.dwBuildNumber >= 22000 {
            "Windows 11"
        } else {
            "Windows 10"
        };
        format!(
            "{name} (build {}, {})",
            v.dwBuildNumber,
            std::env::consts::ARCH
        )
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)
    }
}
