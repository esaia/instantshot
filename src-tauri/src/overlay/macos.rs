//! AppKit tweaks for the overlay: shield-level, all Spaces (including full-screen apps), no
//! animation/shadow, and an exact frame covering the menu bar and Dock.

use std::cell::RefCell;

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSEvent, NSRunningApplication,
    NSScreenSaverWindowLevel, NSWindow, NSWindowAnimationBehavior, NSWindowCollectionBehavior,
    NSWorkspace,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{CGDisplayBounds, CGMainDisplayID};
use tauri::WebviewWindow;

use crate::display::Display;

thread_local! {
    static PREVIOUS_APP: RefCell<Option<Retained<NSRunningApplication>>> = const { RefCell::new(None) };
}

fn ns_window(window: &WebviewWindow) -> Option<&NSWindow> {
    let ptr = window.ns_window().ok()?;
    // SAFETY: Tauri returns a valid NSWindow pointer that lives as long as the window.
    unsafe { ptr.cast::<NSWindow>().as_ref() }
}

pub fn configure(window: &WebviewWindow) {
    let Some(ns) = ns_window(window) else { return };
    ns.setLevel(NSScreenSaverWindowLevel);
    ns.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    ns.setHasShadow(false);
    ns.setAnimationBehavior(NSWindowAnimationBehavior::None);
}

/// Height of the primary display, used to flip CoreGraphics (top-left) to Cocoa (bottom-left).
fn primary_height() -> f64 {
    CGDisplayBounds(CGMainDisplayID()).size.height
}

pub fn reveal(window: &WebviewWindow, display: &Display, key: bool) {
    let Some(ns) = ns_window(window) else { return };
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    configure(window);
    let r = display.logical;
    let frame = CGRect::new(
        CGPoint::new(r.x, primary_height() - (r.y + r.height)),
        CGSize::new(r.width, r.height),
    );
    ns.setFrame_display(frame, true);
    if key {
        NSApplication::sharedApplication(mtm).activate();
        ns.makeKeyAndOrderFront(None);
    } else {
        ns.orderFrontRegardless();
    }
}

/// Id of the display containing the mouse pointer.
pub fn cursor_display(displays: &[Display]) -> Option<String> {
    let p = NSEvent::mouseLocation();
    let (x, y) = (p.x, primary_height() - p.y);
    displays
        .iter()
        .find(|d| {
            let r = d.logical;
            x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
        })
        .map(|d| d.id.clone())
}

pub fn save_focus() {
    let front = NSWorkspace::sharedWorkspace().frontmostApplication();
    let own = NSRunningApplication::currentApplication().processIdentifier();
    let front = front.filter(|app| app.processIdentifier() != own);
    PREVIOUS_APP.with(|slot| *slot.borrow_mut() = front);
}

pub fn restore_focus() {
    if let Some(app) = PREVIOUS_APP.with(|slot| slot.borrow_mut().take()) {
        app.activateWithOptions(NSApplicationActivationOptions::empty());
    }
}

/// Shows a click-through HUD window without activating the app or taking key status.
pub fn show_hud(window: &WebviewWindow, _display: &Display, frame: crate::geometry::Rect) {
    let Some(ns) = ns_window(window) else { return };
    configure(window);
    ns.setIgnoresMouseEvents(true);
    let rect = CGRect::new(
        CGPoint::new(frame.x, primary_height() - (frame.y + frame.height)),
        CGSize::new(frame.width, frame.height),
    );
    ns.setFrame_display(rect, true);
    ns.orderFrontRegardless();
}
