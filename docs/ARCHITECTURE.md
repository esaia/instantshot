# Architecture

InstantShot is a [Tauri 2](https://tauri.app) app: a Rust backend that talks to each OS's native
capture and OCR APIs, and a single React bundle for every window (the window label picks the view).

## Project layout

```text
src/                         React UI (one bundle; the window label picks the view)
  components/CaptureOverlay   selection layer (one per display)
  components/Toast            confirmation HUD
  components/Settings         settings window (+ ShortcutInput, PermissionStatus)
  lib/                        typed command wrappers, shortcut formatting
src-tauri/src/
  controller.rs               capture session orchestration
  workflow.rs                 state machine (Idle → Selecting → Capturing → OCR → Copying)
  geometry.rs                 logical ↔ physical coordinate conversion
  display/{macos,windows}     native display enumeration
  capture/{macos,windows}     region capture → BGRA frame
  ocr/{macos,windows}         Vision / Windows.Media.Ocr → positioned text
  ocr/layout.rs               reading order, lines, paragraphs, indentation (shared)
  overlay/{macos,windows}     overlay window pool, native window tweaks, focus restore
  feedback.rs                 HUD, settings.rs, shortcuts.rs, tray.rs, permissions.rs
website/                     Next.js landing page (static export)
```

## How capture works

1. The shortcut starts a session. A second press while selecting cancels it; presses while a
   capture is processing are ignored, so sessions never overlap.
2. InstantShot remembers the frontmost app, then shows one borderless transparent overlay per
   display. Overlays are created on first use and reused afterwards.
3. When you release the mouse, only the selected rectangle is captured, with InstantShot's own
   windows excluded: `SCContentFilter` excluding the app on macOS, `WDA_EXCLUDEFROMCAPTURE` on
   Windows. The selection is also drawn as a clear hole (dimming and border sit outside it),
   so the captured pixels are never tinted.
4. OCR runs on a background thread. The text is copied, focus returns to the previous app, and
   the HUD confirms.

Every outcome (success, cancel, no text, permission, capture/OCR/clipboard error) goes through
one exit path that hides the overlays, restores focus, and resets the state. If an overlay fails
to report ready within 2.5 s, the session is aborted, so an invisible window can never keep
intercepting input.

macOS 14 is the minimum because InstantShot uses ScreenCaptureKit's one-shot
`SCScreenshotManager`. The older `CGWindowListCreateImage` API is obsoleted in the macOS 15 SDK.

## Coordinate strategy

Each overlay covers exactly one display, and a selection stays within that display. The overlay
reports the rectangle in window-local CSS pixels.

- **macOS:** CSS px are points. The rect is passed as `sourceRect` (display-local points), and
  the output size is points × the display's backing scale factor.
- **Windows:** physical px = CSS px × monitor DPI scale. The result is offset by the monitor's
  physical origin in the virtual desktop, which can be negative for displays left of or above
  the primary.

Edges are rounded independently so fractional scales (125%, 150%) don't drift. Unit tests in
`geometry.rs` cover these cases.
