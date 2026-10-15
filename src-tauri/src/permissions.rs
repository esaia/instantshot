//! Screen capture permission. Only macOS gates screen capture behind a user permission
//! (Privacy & Security › Screen & System Audio Recording). No Accessibility permission is used.

use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // each platform constructs a subset
pub enum PermissionState {
    Granted,
    /// Not granted (never asked or denied). macOS does not distinguish the two via public API.
    NotGranted,
    /// The platform has no such permission.
    NotRequired,
}

#[cfg(target_os = "macos")]
pub fn screen_capture() -> PermissionState {
    if objc2_core_graphics::CGPreflightScreenCaptureAccess() {
        PermissionState::Granted
    } else {
        PermissionState::NotGranted
    }
}

#[cfg(not(target_os = "macos"))]
pub fn screen_capture() -> PermissionState {
    PermissionState::NotRequired
}

/// Shows the system prompt the first time; afterwards macOS only records the request and the
/// user must enable InstantShot in System Settings (and usually relaunch it).
#[cfg(target_os = "macos")]
pub fn request_screen_capture() -> bool {
    objc2_core_graphics::CGRequestScreenCaptureAccess()
}

#[cfg(not(target_os = "macos"))]
pub fn request_screen_capture() -> bool {
    true
}

/// Deep link to the relevant System Settings pane.
#[cfg(target_os = "macos")]
pub const SETTINGS_URL: Option<&str> =
    Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");

#[cfg(not(target_os = "macos"))]
pub const SETTINGS_URL: Option<&str> = None;
