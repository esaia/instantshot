//! Menu bar (macOS) / system tray (Windows) icon and menu.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::workflow::CaptureMode;

const CAPTURE: &str = "capture";
const CAPTURE_SCREENSHOT: &str = "capture-screenshot";
const SETTINGS: &str = "settings";
const LOGIN: &str = "launch-at-login";
const QUIT: &str = "quit";

/// Kept in managed state so the checkbox can be updated when Settings changes it.
pub struct LoginItem(pub CheckMenuItem<Wry>);

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let launch_at_login = app.autolaunch().is_enabled().unwrap_or(false);
    let login = CheckMenuItem::with_id(
        app,
        LOGIN,
        "Launch at Login",
        true,
        launch_at_login,
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "title", "TextPicker", false, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, CAPTURE, "Capture Text", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                CAPTURE_SCREENSHOT,
                "Capture Screenshot",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(app, SETTINGS, "Settings…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &login,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, QUIT, "Quit TextPicker", true, None::<&str>)?,
        ],
    )?;
    app.manage(LoginItem(login));

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("TextPicker")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            CAPTURE => crate::controller::on_hotkey(app, CaptureMode::Text),
            CAPTURE_SCREENSHOT => crate::controller::on_hotkey(app, CaptureMode::Screenshot),
            SETTINGS => crate::show_settings(app),
            LOGIN => {
                let enable = !app.autolaunch().is_enabled().unwrap_or(false);
                if let Err(err) = crate::set_launch_at_login(app, enable) {
                    log::error!("launch at login: {err}");
                }
            }
            QUIT => app.exit(0),
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
        builder = builder.icon(icon).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon().cloned() {
            builder = builder.icon(icon);
        }
    }
    builder.build(app)?;
    Ok(())
}

pub fn sync_login_item(app: &AppHandle, enabled: bool) {
    if let Some(item) = app.try_state::<LoginItem>() {
        let _ = item.0.set_checked(enabled);
    }
}
