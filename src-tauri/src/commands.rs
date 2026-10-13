//! Tauri commands. Kept thin: they validate input and delegate to the owning module.

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

use crate::controller::{self, CaptureController};
use crate::error::AppError;
use crate::geometry::Rect;
use crate::ocr::{self, LanguageStatus};
use crate::permissions::{self, PermissionState};
use crate::settings::{self, Settings};
use crate::{overlay, shortcuts};

// ---- Overlay ----

/// Returns the session the overlay should display, or `None` if no selection is active.
#[tauri::command]
pub fn overlay_session(app: AppHandle) -> Option<u64> {
    app.state::<CaptureController>().selecting_session()
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle, window: WebviewWindow, session: u64) {
    if overlay::is_overlay(window.label()) {
        controller::overlay_ready(&app, window, session);
    }
}

#[tauri::command]
pub async fn finish_selection(app: AppHandle, window: WebviewWindow, session: u64, rect: Rect) {
    if overlay::is_overlay(window.label()) {
        controller::finish_selection(app, window.label().to_string(), session, rect).await;
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
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: os_description(),
        platform: std::env::consts::OS,
        default_shortcut: settings::DEFAULT_SHORTCUT,
        shortcut_registered: shortcuts::is_registered(&app, &settings::get(&app).shortcut),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    settings::get(&app)
}

/// Saves everything except the shortcut, which goes through [`set_shortcut`].
#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, AppError> {
    let mut next = settings;
    next.shortcut = settings::get(&app).shortcut;
    settings::save(&app, next.clone()).map_err(|e| {
        log::error!("saving settings failed: {e}");
        AppError::msg("Couldn't save settings")
    })?;
    Ok(next)
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, shortcut: String) -> Result<Settings, AppError> {
    let mut current = settings::get(&app);
    shortcuts::replace(&app, Some(&current.shortcut), &shortcut).map_err(AppError::Message)?;
    current.shortcut = shortcut;
    settings::save(&app, current.clone()).map_err(|_| AppError::msg("Couldn't save settings"))?;
    Ok(current)
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
