//! Win32 tweaks for overlays: exclusion from capture, exact physical placement across mixed-DPI
//! monitors, non-activating HUD, and foreground window save/restore.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};

use tauri::WebviewWindow;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Dwm::{
    DWM_WINDOW_CORNER_PREFERENCE, DWMWA_TRANSITIONS_FORCEDISABLED, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_DONOTROUND, DwmSetWindowAttribute,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GWL_STYLE, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, HWND_TOPMOST,
    IsWindow, SW_HIDE, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_NOZORDER, SWP_SHOWWINDOW, SetForegroundWindow, SetWindowDisplayAffinity, SetWindowLongPtrW,
    SetWindowPos, ShowWindow, ShowWindowAsync, WDA_EXCLUDEFROMCAPTURE, WS_EX_APPWINDOW,
    WS_EX_TOOLWINDOW, WS_EX_WINDOWEDGE, WS_OVERLAPPEDWINDOW, WS_POPUP,
};

use crate::display::Display;
use crate::geometry::Rect;

static PREVIOUS_FOREGROUND: AtomicIsize = AtomicIsize::new(0);
/// True only while every overlay has been excluded from capture successfully.
static EXCLUSION_OK: AtomicBool = AtomicBool::new(true);

fn hwnd(window: &WebviewWindow) -> Option<HWND> {
    window.hwnd().ok()
}

pub fn exclusion_supported() -> bool {
    EXCLUSION_OK.load(Ordering::SeqCst)
}

/// Turns `h` into a plain popup: no caption or frame, no Alt+Tab entry, square corners and no
/// open/close animation, so it appears in place instead of opening like a new window.
///
/// tao keeps `WS_CAPTION` on undecorated windows and strips the frame only in the refresh its
/// own show path runs. These windows are shown with `ShowWindow` directly (to stay
/// non-activating and placed in physical pixels), which skips that refresh, so without this
/// they come up with a title bar and border.
fn make_popup(h: HWND) {
    // SAFETY: valid window handle; the attribute pointers outlive the calls.
    unsafe {
        let style = GetWindowLongPtrW(h, GWL_STYLE);
        let style = (style & !(WS_OVERLAPPEDWINDOW.0 as isize)) | WS_POPUP.0 as isize;
        SetWindowLongPtrW(h, GWL_STYLE, style);
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        let ex = (ex & !((WS_EX_APPWINDOW.0 | WS_EX_WINDOWEDGE.0) as isize))
            | WS_EX_TOOLWINDOW.0 as isize;
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex);

        let disabled: i32 = 1;
        let _ = DwmSetWindowAttribute(
            h,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&disabled as *const i32).cast::<c_void>(),
            size_of::<i32>() as u32,
        );
        // Windows 11 only; fails harmlessly on Windows 10.
        let corners = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            h,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&corners as *const DWM_WINDOW_CORNER_PREFERENCE).cast::<c_void>(),
            size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );

        let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED;
        let _ = SetWindowPos(h, None, 0, 0, 0, 0, flags);
    }
}

pub fn configure(window: &WebviewWindow) {
    let Some(h) = hwnd(window) else { return };
    make_popup(h);
    // SAFETY: valid top-level window handle owned by this process.
    if unsafe { SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE) }.is_err() {
        // Windows 10 before 2004: capture falls back to hide-then-capture.
        EXCLUSION_OK.store(false, Ordering::SeqCst);
    }
}

/// Places the window over `x, y, w, h` (physical pixels). Applied twice because moving onto a
/// monitor with a different DPI makes the window resize itself (WM_DPICHANGED) once.
fn place(h: HWND, x: i32, y: i32, w: i32, height: i32) {
    for _ in 0..2 {
        // SAFETY: valid window handle.
        let _ = unsafe { SetWindowPos(h, Some(HWND_TOPMOST), x, y, w, height, SWP_NOACTIVATE) };
    }
}

pub fn reveal(window: &WebviewWindow, display: &Display, key: bool) {
    let Some(h) = hwnd(window) else { return };
    configure(window);
    place(
        h,
        display.physical_x,
        display.physical_y,
        display.physical_width as i32,
        display.physical_height as i32,
    );
    // SAFETY: valid window handle.
    unsafe {
        let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        let flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE;
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
    }
    if key {
        // Receiving the hotkey gives this process the right to take the foreground.
        let _ = unsafe { SetForegroundWindow(h) };
        let _ = window.set_focus();
    }
}

pub fn cursor_display(displays: &[Display]) -> Option<String> {
    let mut p = POINT::default();
    // SAFETY: valid out-pointer.
    unsafe { GetCursorPos(&mut p) }.ok()?;
    displays
        .iter()
        .find(|d| {
            p.x >= d.physical_x
                && p.x < d.physical_x + d.physical_width as i32
                && p.y >= d.physical_y
                && p.y < d.physical_y + d.physical_height as i32
        })
        .map(|d| d.id.clone())
}

pub fn save_focus() {
    // SAFETY: no preconditions.
    let h = unsafe { GetForegroundWindow() };
    PREVIOUS_FOREGROUND.store(h.0 as isize, Ordering::SeqCst);
}

pub fn restore_focus() {
    let raw = PREVIOUS_FOREGROUND.swap(0, Ordering::SeqCst);
    if raw == 0 {
        return;
    }
    let h = HWND(raw as *mut _);
    // SAFETY: IsWindow validates the handle before use.
    unsafe {
        if IsWindow(Some(h)).as_bool() {
            let _ = SetForegroundWindow(h);
        }
    }
}

/// Shows the HUD without activating it. `frame` is in the display's logical space.
pub fn show_hud(window: &WebviewWindow, display: &Display, frame: Rect) {
    let Some(h) = hwnd(window) else { return };
    make_popup(h);
    let s = display.scale;
    let x = display.physical_x + ((frame.x - display.logical.x) * s).round() as i32;
    let y = display.physical_y + ((frame.y - display.logical.y) * s).round() as i32;
    place(
        h,
        x,
        y,
        (frame.width * s).round() as i32,
        (frame.height * s).round() as i32,
    );
    // SAFETY: valid window handle.
    let _ = unsafe { ShowWindow(h, SW_SHOWNOACTIVATE) };
}

/// Hides a window shown by [`reveal`] or [`show_hud`]. tao never saw those windows become
/// visible, so its own `hide()` would see no change and leave them on screen. Async so callers
/// off the main thread don't block on it.
pub fn hide(window: &WebviewWindow) {
    let Some(h) = hwnd(window) else { return };
    // SAFETY: valid window handle.
    let _ = unsafe { ShowWindowAsync(h, SW_HIDE) };
}
