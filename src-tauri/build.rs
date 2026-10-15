/// Every app command. Declaring them makes each one deny-by-default; the capability files grant
/// overlay commands only to overlay windows, settings commands only to the settings window, and
/// editor commands only to the editor window.
const COMMANDS: &[&str] = &[
    // Overlay windows
    "overlay_session",
    "overlay_ready",
    "overlay_frame",
    "finish_selection",
    "cancel_capture",
    // Settings window
    "app_info",
    "get_settings",
    "update_settings",
    "set_shortcut",
    "set_screenshot_shortcut",
    "choose_save_folder",
    "reset_save_folder",
    "set_shortcut_paused",
    "get_launch_at_login",
    "set_launch_at_login",
    "permission_status",
    "request_permission",
    "ocr_language_status",
    "open_permission_settings",
    "restart_app",
    "check_for_updates",
    // Screenshot editor window
    "editor_image",
    "editor_markup",
    "editor_ready",
    "copy_image",
    "save_image",
    "quick_save",
    "reveal_last_save",
    "start_drag",
    "list_system_wallpapers",
    "wallpaper_image",
    "get_editor_style",
    "set_editor_style",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
