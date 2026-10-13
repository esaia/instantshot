/// Every app command. Declaring them makes each one deny-by-default; the capability files grant
/// overlay commands only to overlay windows and settings commands only to the settings window.
const COMMANDS: &[&str] = &[
    // Overlay windows
    "overlay_session",
    "overlay_ready",
    "finish_selection",
    "cancel_capture",
    // Settings window
    "app_info",
    "get_settings",
    "update_settings",
    "set_shortcut",
    "set_shortcut_paused",
    "get_launch_at_login",
    "set_launch_at_login",
    "permission_status",
    "request_permission",
    "ocr_language_status",
    "open_permission_settings",
    "restart_app",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
