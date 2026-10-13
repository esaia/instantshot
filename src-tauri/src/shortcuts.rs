//! Global capture shortcut: validation, registration and safe replacement.
//!
//! Conflict detection is best effort. Windows reports combinations already registered by other
//! apps (`RegisterHotKey` fails). macOS accepts most combinations even when another app uses
//! them, so we additionally reject well-known system shortcuts.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// Parses and validates a shortcut string such as `Super+Shift+Digit2`.
pub fn parse(accelerator: &str) -> Result<Shortcut, String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| "That shortcut isn't valid".to_string())?;
    if shortcut.mods.is_empty() {
        return Err("Use at least one modifier key (⌘, Ctrl, ⌥/Alt or ⇧)".into());
    }
    if is_reserved(&shortcut) {
        return Err("That shortcut is reserved by the system".into());
    }
    Ok(shortcut)
}

fn is_reserved(shortcut: &Shortcut) -> bool {
    use tauri_plugin_global_shortcut::{Code, Modifiers};
    let m = shortcut.mods;
    let k = shortcut.key;
    let only = |mods: Modifiers| m == mods;
    #[cfg(target_os = "macos")]
    {
        let cmd_shift = Modifiers::SUPER | Modifiers::SHIFT;
        (only(cmd_shift) && matches!(k, Code::Digit3 | Code::Digit4 | Code::Digit5 | Code::Digit6))
            || (only(cmd_shift | Modifiers::CONTROL) && matches!(k, Code::Digit3 | Code::Digit4))
            || (only(Modifiers::SUPER)
                && matches!(
                    k,
                    Code::Space | Code::Tab | Code::KeyQ | Code::KeyW | Code::KeyH
                ))
            || (only(Modifiers::CONTROL) && k == Code::Space)
            || (only(Modifiers::SUPER | Modifiers::ALT) && k == Code::Escape)
    }
    #[cfg(not(target_os = "macos"))]
    {
        (only(Modifiers::ALT) && matches!(k, Code::Tab | Code::F4))
            || (only(Modifiers::CONTROL | Modifiers::ALT) && k == Code::Delete)
            || (only(Modifiers::CONTROL | Modifiers::SHIFT) && k == Code::Escape)
            || m.contains(Modifiers::SUPER)
    }
}

pub fn is_registered(app: &AppHandle, accelerator: &str) -> bool {
    accelerator
        .parse::<Shortcut>()
        .is_ok_and(|s| app.global_shortcut().is_registered(s))
}

/// Registers `accelerator` as the capture shortcut, replacing `previous`. The new shortcut is
/// registered before the old one is removed, so a failure leaves the old shortcut working.
pub fn replace(app: &AppHandle, previous: Option<&str>, accelerator: &str) -> Result<(), String> {
    let next = parse(accelerator)?;
    let gs = app.global_shortcut();
    let prev = previous.and_then(|p| p.parse::<Shortcut>().ok());
    if prev.as_ref().is_some_and(|p| p.id() == next.id()) && gs.is_registered(next) {
        return Ok(());
    }
    gs.register(next).map_err(|err| {
        log::warn!("shortcut registration failed: {err}");
        "That shortcut is already in use by another app".to_string()
    })?;
    if let Some(prev) = prev {
        if prev.id() != next.id() {
            let _ = gs.unregister(prev);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shortcut_is_valid() {
        assert!(parse(crate::settings::DEFAULT_SHORTCUT).is_ok());
    }

    #[test]
    fn rejects_garbage_and_bare_keys() {
        assert!(parse("NotAKey").is_err());
        assert!(parse("KeyA").is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn rejects_system_screenshot_shortcuts() {
        assert!(parse("Super+Shift+Digit4").is_err());
        assert!(parse("Super+Space").is_err());
        assert!(parse("Super+Shift+KeyT").is_ok());
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn rejects_windows_reserved() {
        assert!(parse("Alt+F4").is_err());
        assert!(parse("Super+Shift+KeyS").is_err());
        assert!(parse("Control+Shift+KeyT").is_ok());
    }
}
