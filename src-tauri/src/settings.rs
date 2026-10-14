//! Typed settings persisted with tauri-plugin-store. Rust owns the settings; the frontend reads
//! and writes them only through commands. "Launch at login" is not stored here: the autostart
//! plugin (the OS login item) is the source of truth.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::ocr::OcrOptions;

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";
/// The screenshot editor's last style. Separate from [`Settings`] so the Settings window, which
/// writes its whole copy back, can never overwrite it.
const EDITOR_STYLE_KEY: &str = "editorStyle";
const EDITOR_STYLE_MAX_BYTES: usize = 32 * 1024;

#[cfg(target_os = "macos")]
pub const DEFAULT_SHORTCUT: &str = "Super+Shift+Digit2";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_SHORTCUT: &str = "Control+Shift+Digit2";

#[cfg(target_os = "macos")]
pub const DEFAULT_SCREENSHOT_SHORTCUT: &str = "Super+Shift+Digit1";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_SCREENSHOT_SHORTCUT: &str = "Control+Shift+Digit1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub shortcut: String,
    pub show_notification: bool,
    pub start_minimized: bool,
    pub auto_language: bool,
    pub preserve_line_breaks: bool,
    /// Set once the Settings window has been shown on first launch.
    pub onboarded: bool,
    pub screenshot_shortcut: String,
    /// Quick-save destination. `None` means the Desktop.
    pub save_folder: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: DEFAULT_SHORTCUT.to_string(),
            show_notification: true,
            start_minimized: false,
            auto_language: true,
            preserve_line_breaks: true,
            onboarded: false,
            screenshot_shortcut: DEFAULT_SCREENSHOT_SHORTCUT.to_string(),
            save_folder: None,
        }
    }
}

/// In-memory copy, so the capture path never touches disk.
#[derive(Default)]
pub struct SettingsState(Mutex<Settings>);

pub fn load(app: &AppHandle) -> Settings {
    let settings = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(STORE_KEY))
        .and_then(|value| serde_json::from_value::<Settings>(value).ok())
        .unwrap_or_default();
    *app.state::<SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = settings.clone();
    settings
}

pub fn get(app: &AppHandle) -> Settings {
    app.state::<SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

pub fn save(app: &AppHandle, settings: Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(&settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    *app.state::<SettingsState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = settings;
    Ok(())
}

/// Quick-save folder: the configured one if it still exists, otherwise the Desktop.
pub fn save_folder(app: &AppHandle) -> Option<PathBuf> {
    get(app)
        .save_folder
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| app.path().desktop_dir().ok())
}

/// The editor's last style, as opaque JSON validated by the frontend.
pub fn editor_style(app: &AppHandle) -> Option<serde_json::Value> {
    app.store(STORE_FILE).ok()?.get(EDITOR_STYLE_KEY)
}

pub fn save_editor_style(app: &AppHandle, style: serde_json::Value) -> Result<(), String> {
    if style.to_string().len() > EDITOR_STYLE_MAX_BYTES {
        return Err("style too large".into());
    }
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(EDITOR_STYLE_KEY, style);
    store.save().map_err(|e| e.to_string())
}

pub fn ocr_options(app: &AppHandle) -> OcrOptions {
    let s = get(app);
    OcrOptions {
        auto_language: s.auto_language,
        preserve_line_breaks: s.preserve_line_breaks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"showNotification": false}"#).unwrap();
        assert!(!s.show_notification);
        assert_eq!(s.shortcut, DEFAULT_SHORTCUT);
        assert!(s.preserve_line_breaks);
        assert_eq!(s.screenshot_shortcut, DEFAULT_SCREENSHOT_SHORTCUT);
        assert_eq!(s.save_folder, None);
    }
}
