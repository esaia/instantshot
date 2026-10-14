mod capture;
mod commands;
mod controller;
mod display;
mod editor;
mod error;
mod export;
mod feedback;
mod geometry;
mod ocr;
mod overlay;
mod permissions;
mod settings;
mod shortcuts;
mod tray;
mod wallpapers;
mod workflow;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::ShortcutState;

use controller::CaptureController;
use editor::EditorState;
use export::LastSave;
use settings::SettingsState;
use wallpapers::WallpaperState;

pub const SETTINGS_LABEL: &str = "settings";
const AUTOSTART_ARG: &str = "--autostart";

/// Set while the Settings window records a new shortcut, so pressing the current one there
/// doesn't start a capture.
#[derive(Default)]
struct ShortcutPaused(AtomicBool);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so a second launch exits before doing any work.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_settings(app);
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed
                        || app.state::<ShortcutPaused>().0.load(Ordering::SeqCst)
                    {
                        return;
                    }
                    let Some(mode) = shortcuts::mode_for(app, shortcut) else {
                        return;
                    };
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || controller::on_hotkey(&handle, mode));
                })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        // Used from Rust only (save panel, folder picker); the pages get no dialog permissions.
        .plugin(tauri_plugin_dialog::init())
        .manage(CaptureController::default())
        .manage(SettingsState::default())
        .manage(ShortcutPaused::default())
        .manage(EditorState::default())
        .manage(LastSave::default())
        .manage(WallpaperState::default())
        .invoke_handler(tauri::generate_handler![
            commands::overlay_session,
            commands::overlay_ready,
            commands::finish_selection,
            commands::cancel_capture,
            commands::app_info,
            commands::get_settings,
            commands::update_settings,
            commands::set_shortcut,
            commands::set_screenshot_shortcut,
            commands::choose_save_folder,
            commands::reset_save_folder,
            commands::set_shortcut_paused,
            commands::get_launch_at_login,
            commands::set_launch_at_login,
            commands::permission_status,
            commands::request_permission,
            commands::ocr_language_status,
            commands::open_permission_settings,
            commands::restart_app,
            commands::editor_image,
            commands::editor_ready,
            commands::copy_image,
            commands::save_image,
            commands::quick_save,
            commands::reveal_last_save,
            commands::start_drag,
            commands::list_system_wallpapers,
            commands::wallpaper_image,
            commands::get_editor_style,
            commands::set_editor_style,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let mut settings = settings::load(&handle);
            let shortcut_ok = register_initial_shortcut(&handle, &mut settings);
            register_screenshot_shortcut(&handle, &mut settings);
            tray::create(&handle)?;
            export::clear_drag_dir(&handle);
            // Load the editor page in the background so the first screenshot opens instantly.
            let preload_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(800)).await;
                editor::preload(&preload_handle);
            });

            let autostarted = std::env::args().any(|a| a == AUTOSTART_ARG);
            if !shortcut_ok {
                // Nothing would happen on the shortcut; tell the user instead of failing silently.
                show_settings(&handle);
            } else if !settings.onboarded {
                settings.onboarded = true;
                let _ = settings::save(&handle, settings.clone());
                show_settings(&handle);
            } else if !autostarted && !settings.start_minimized {
                show_settings(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == SETTINGS_LABEL => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if overlay::is_overlay(window.label()) => {
                cancel_if_overlays_lost_focus(window.app_handle().clone());
            }
            WindowEvent::CloseRequested { api, .. } if window.label() == editor::EDITOR_LABEL => {
                api.prevent_close();
                editor::close(window.app_handle(), window);
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building TextPicker")
        .run(|_app, event| match event {
            // Background utility: never exit just because no window is open.
            RunEvent::ExitRequested {
                code: None, api, ..
            } => api.prevent_exit(),
            // macOS: opening the app again (Finder, Spotlight) while it runs shows Settings.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_settings(_app),
            _ => {}
        });
}

/// Registers the saved shortcut, falling back to the default if it can no longer be registered.
/// Returns whether any capture shortcut is active.
fn register_initial_shortcut(app: &AppHandle, settings: &mut settings::Settings) -> bool {
    if shortcuts::replace(app, None, &settings.shortcut).is_ok() {
        return true;
    }
    log::warn!("saved shortcut unavailable; falling back to default");
    if settings.shortcut != settings::DEFAULT_SHORTCUT
        && shortcuts::replace(app, None, settings::DEFAULT_SHORTCUT).is_ok()
    {
        settings.shortcut = settings::DEFAULT_SHORTCUT.to_string();
        let _ = settings::save(app, settings.clone());
        return true;
    }
    false
}

/// Registers the screenshot shortcut, falling back to the default. Failure is not fatal: the tray
/// item still works and Settings shows a warning.
fn register_screenshot_shortcut(app: &AppHandle, settings: &mut settings::Settings) {
    let saved = settings.screenshot_shortcut.clone();
    if !shortcuts::same(&saved, &settings.shortcut) && shortcuts::replace(app, None, &saved).is_ok()
    {
        return;
    }
    let default = settings::DEFAULT_SCREENSHOT_SHORTCUT;
    if saved != default
        && !shortcuts::same(default, &settings.shortcut)
        && shortcuts::replace(app, None, default).is_ok()
    {
        log::warn!("saved screenshot shortcut unavailable; using the default");
        settings.screenshot_shortcut = default.to_string();
        let _ = settings::save(app, settings.clone());
    } else {
        log::warn!("screenshot shortcut unavailable");
    }
}

/// Cancels the selection when focus leaves every overlay (Cmd-Tab, screen lock, …). The delay
/// lets focus move between overlays on different displays without cancelling.
fn cancel_if_overlays_lost_focus(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(200)).await;
        let Some(session) = app.state::<CaptureController>().selecting_session() else {
            return;
        };
        let focused = overlay::overlays(&app)
            .iter()
            .any(|w| w.is_focused().unwrap_or(false));
        if !focused {
            log::debug!("overlays lost focus; cancelling session {session}");
            controller::cancel(&app, session);
        }
    });
}

pub fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn set_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    result.map_err(|e| e.to_string())?;
    tray::sync_login_item(app, autolaunch.is_enabled().unwrap_or(enabled));
    Ok(())
}

pub fn set_shortcut_paused(app: &AppHandle, paused: bool) {
    app.state::<ShortcutPaused>()
        .0
        .store(paused, Ordering::SeqCst);
}
