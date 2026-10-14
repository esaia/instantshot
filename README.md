# TextPicker

**Select text anywhere. Copy instantly.**

TextPicker is a small background utility for macOS and Windows. Press a shortcut, drag a box
around any text on screen (websites, apps, videos, images, PDFs), and the recognized text is on
your clipboard, ready to paste.

- Default shortcut: **⇧⌘2** on macOS, **Ctrl+Shift+2** on Windows
- **Screenshots** (**⇧⌘1** / **Ctrl+Shift+1**): select a region and it opens in an editor that
  puts it on a wallpaper, color or gradient background with padding, rounded corners, shadow,
  window chrome and aspect presets, plus arrows, shapes, text, blur and pixelate. Copy, save,
  quick-save to a folder, or drag the result into any app.
- Lives in the menu bar (macOS) or the system tray (Windows); no Dock or taskbar icon
- Text recognition runs **locally** with the OS's own engine: Apple Vision on macOS,
  Windows.Media.Ocr on Windows

## Privacy

TextPicker never uploads screenshots or text, has no analytics or telemetry, and makes no
network requests. For text capture, pixels exist only in memory for the duration of one
recognition. A screenshot stays in memory while its editor is open and is written to disk only
when you save it; dragging it out writes a temporary PNG to the app's cache folder, deleted when
the editor closes. Besides your saved files, the only file TextPicker writes is its settings
(`settings.json` in the app data directory, including the editor's last style). Diagnostic logs
record timings and errors, never captured text.

## Requirements

| | Minimum | Notes |
|---|---|---|
| macOS | 14 Sonoma (Apple Silicon or Intel) | Requires *Screen & System Audio Recording* permission |
| Windows | Windows 10 1809+ / Windows 11 | Needs at least one language with the *Optical character recognition* feature; WebView2 (built into Windows 11, installed by the installer on Windows 10) |

macOS 14 is required because TextPicker uses ScreenCaptureKit's one-shot `SCScreenshotManager`.
The older `CGWindowListCreateImage` API is obsoleted in the macOS 15 SDK.

## Using TextPicker

1. Launch TextPicker. On first launch the Settings window explains the permission and shortcut.
2. Press the shortcut. The screen dims slightly and the cursor becomes a crosshair.
3. Drag over the text. When you release, the text is copied and a small confirmation appears.
4. Paste anywhere.

To cancel, press **Esc**, press the shortcut again, or switch apps. Cancelling (or finding no
text) leaves the clipboard exactly as it was.

The menu bar / tray menu has **Capture Text**, **Settings…**, **Launch at Login**, and **Quit**.
Closing Settings keeps TextPicker running.

### macOS permission

macOS requires Screen Recording permission for any app that reads screen pixels. TextPicker
asks the first time you capture. Enable it in **System Settings › Privacy & Security › Screen
& System Audio Recording**, then relaunch TextPicker (macOS applies the change only after a
restart). TextPicker does **not** use Accessibility permission. On macOS 15 and later, the
system may occasionally ask you to re-confirm screen access. That prompt comes from macOS.

## Development

Prerequisites: Rust (stable), Node.js 20.19+ or 22+, pnpm 10, plus Xcode Command Line Tools
(macOS) or the MSVC build tools and WebView2 (Windows). See
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev          # run in development
pnpm dev                # UI-only browser preview at http://localhost:1420 (backend simulated)
pnpm check              # TypeScript, Biome lint, Vitest
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

`cargo test` includes real OCR runs on the fixture images in `src-tauri/tests/fixtures`.

**macOS permission during development.** The Screen Recording grant is tied to the app's code
signature. Ad-hoc signed builds get a new signature on every rebuild, so macOS forgets the grant.
Build a bundle signed with your own development certificate to keep it stable:

```sh
export APPLE_SIGNING_IDENTITY="Apple Development: Your Name (TEAMID)"
pnpm tauri build --debug --bundles app
open src-tauri/target/debug/bundle/macos/TextPicker.app
```

Under `pnpm tauri dev` the permission belongs to your terminal app instead.

### Landing page

The Next.js landing page is in `website/` and builds as a static site without changing the
desktop app's Vite/Tauri setup.

```sh
cd website
pnpm install
pnpm dev             # local preview
pnpm build           # static output in website/out/
```

The current page links only to its own sections and preview. Add a real download destination
once release artifacts are available; the GitHub and website URLs in the desktop settings are
still placeholders.

### Project layout

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
```

### How capture works

1. The shortcut starts a session. A second press while selecting cancels it; presses while a
   capture is processing are ignored, so sessions never overlap.
2. TextPicker remembers the frontmost app, then shows one borderless transparent overlay per
   display. Overlays are created on first use and reused afterwards.
3. When you release the mouse, only the selected rectangle is captured, with TextPicker's own
   windows excluded: `SCContentFilter` excluding the app on macOS, `WDA_EXCLUDEFROMCAPTURE` on
   Windows. The selection is also drawn as a clear hole (dimming and border sit outside it),
   so the captured pixels are never tinted.
4. OCR runs on a background thread. The text is copied, focus returns to the previous app, and
   the HUD confirms.

Every outcome (success, cancel, no text, permission, capture/OCR/clipboard error) goes through
one exit path that hides the overlays, restores focus, and resets the state. If an overlay fails
to report ready within 2.5 s, the session is aborted, so an invisible window can never keep
intercepting input.

### Coordinate strategy

Each overlay covers exactly one display, and a selection stays within that display. The overlay
reports the rectangle in window-local CSS pixels.

- **macOS:** CSS px are points. The rect is passed as `sourceRect` (display-local points), and
  the output size is points × the display's backing scale factor.
- **Windows:** physical px = CSS px × monitor DPI scale. The result is offset by the monitor's
  physical origin in the virtual desktop, which can be negative for displays left of or above
  the primary.

Edges are rounded independently so fractional scales (125%, 150%) don't drift. Unit tests in
`geometry.rs` cover these cases.

## Known limitations

- **Protected content:** DRM video, password fields in some apps, UAC/secure desktop, and other
  OS-protected surfaces are captured as black, which yields "No text found".
- **Vision** occasionally drops a line containing a single punctuation character (for example a
  lone `}` in code). Language correction is disabled so text is copied as recognized (identifiers,
  URLs and accents stay intact).
- **Languages:** OCR languages depend on the OS. Vision on macOS 26 supports 30 languages
  (Latin, Cyrillic, CJK, Arabic, Thai, Vietnamese, …) but not, for example, Georgian. Windows
  recognizes only languages whose OCR feature is installed; Settings lists what is available.
- **Shortcut conflicts:** Windows reports shortcuts already registered by other apps. macOS does
  not, so TextPicker only blocks well-known system shortcuts there.
- A selection can't span two displays (same as the macOS screenshot tool).

## Distribution

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed: a universal
macOS `.dmg` (Apple Silicon + Intel) and a Windows NSIS installer, attached to a draft GitHub
release.

**Never commit signing credentials.** Configure them as repository secrets:

| Secret | Purpose |
|---|---|
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | Base64 `.p12` of a *Developer ID Application* certificate and its password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarization (use an app-specific password) |

Without these secrets the macOS build is unsigned and Gatekeeper will block it. Windows builds
are unsigned by default. To sign them, add a code-signing certificate following
[Tauri's Windows signing guide](https://tauri.app/distribute/sign/windows/). The installer
downloads the WebView2 runtime if it's missing (Windows 10).

Branding lives in `src-tauri/icons`. The sources are `src-tauri/icons/source/*.svg`; render `app-icon.svg` to a 1024px PNG and run `pnpm tauri icon src-tauri/icons/app-icon.png`, then delete the generated `android/` and `ios/` folders. `tray-template.png` is the 44px render of `tray-template.svg`.
The bundle identifier `app.textpicker.desktop` and the website link in
`src/components/Settings.tsx` are placeholders.

## License

TextPicker is free and open source under the [MIT License](LICENSE).
