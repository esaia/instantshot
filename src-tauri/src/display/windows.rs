use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::core::BOOL;

use super::Display;
use crate::geometry::Rect;

/// Lists monitors in physical virtual-desktop coordinates. Tauri makes the process
/// per-monitor-DPI-aware (v2), so `rcMonitor` is in physical pixels and may be negative.
pub fn list() -> Vec<Display> {
    let mut out: Vec<Display> = Vec::new();
    // SAFETY: the callback only runs during this call and writes to `out` through `lparam`.
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(monitor_proc),
            LPARAM(&mut out as *mut Vec<Display> as isize),
        );
    }
    out
}

unsafe extern "system" fn monitor_proc(
    hmon: HMONITOR,
    _: HDC,
    _: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    // SAFETY: `lparam` is the `&mut Vec<Display>` passed to EnumDisplayMonitors above.
    let out = unsafe { &mut *(lparam.0 as *mut Vec<Display>) };
    let mut info = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    // SAFETY: `info` is a properly sized MONITORINFOEXW.
    if !unsafe { GetMonitorInfoW(hmon, &mut info.monitorInfo as *mut MONITORINFO) }.as_bool() {
        return true.into();
    }
    let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
    // SAFETY: valid monitor handle and out-pointers.
    let _ = unsafe { GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y) };
    let scale = f64::from(dpi_x.max(1)) / 96.0;

    let r = info.monitorInfo.rcMonitor;
    let name_len = info
        .szDevice
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(info.szDevice.len());
    let name = String::from_utf16_lossy(&info.szDevice[..name_len]);
    let mut id: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if id.is_empty() {
        id = format!("MON{}", out.len());
    }
    let (w, h) = (
        (r.right - r.left).max(0) as u32,
        (r.bottom - r.top).max(0) as u32,
    );
    out.push(Display {
        id,
        logical: Rect::new(
            f64::from(r.left) / scale,
            f64::from(r.top) / scale,
            f64::from(w) / scale,
            f64::from(h) / scale,
        ),
        physical_x: r.left,
        physical_y: r.top,
        physical_width: w,
        physical_height: h,
        scale,
    });
    true.into()
}
