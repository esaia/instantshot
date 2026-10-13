//! Typed settings persisted with tauri-plugin-store. Rust owns the settings; the frontend reads
//! and writes them only through commands. "Launch at login" is not stored here: the autostart
//! plugin (the OS login item) is the source of truth.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

use crate::ocr::OcrOptions;

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

#[cfg(target_os = "macos")]
pub const DEFAULT_SHORTCUT: &str = "Super+Shift+Digit2";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_SHORTCUT: &str = "Control+Shift+Digit2";

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
    }
}
