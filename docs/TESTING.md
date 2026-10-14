# Testing TextPicker

## Automated

```sh
pnpm check                                        # tsc, Biome, Vitest
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test -- --nocapture                         # unit tests + real OCR on fixtures
```

| Area | Covered by |
|---|---|
| Coordinate conversion (1×/2×/1.25×/1.5×, negative origins, clamping, rounding) | `geometry.rs` tests |
| Workflow state machine (overlap prevention, stale sessions, cancel rules) | `workflow.rs` tests |
| Text layout (reading order, rows, paragraphs, indentation, Unicode) | `ocr/layout.rs` tests |
| OCR end to end on images (English, multi-line, code, light-on-dark, small text, Unicode, blank) | `ocr/tests.rs` (Vision on macOS, Windows.Media.Ocr on Windows) |
| Shortcut validation and reserved combinations | `shortcuts.rs` tests |
| Settings defaults/migration | `settings.rs` tests |
| Shortcut recording/formatting | `src/lib/shortcut.test.ts` |

CI (`.github/workflows/ci.yml`) runs all of the above on macOS and Windows runners.

## Manual checklist

Status key: ✅ verified on real hardware · ⬜ not yet verified.

### Functional (macOS)

- ✅ Shortcut activates the overlay from the background
- ✅ Selecting text → OCR → clipboard → paste into another app
- ✅ No text found leaves the clipboard unchanged
- ⬜ Esc cancels; clipboard unchanged; focus returns to the previous app
- ⬜ Pressing the shortcut again while selecting cancels
- ⬜ Cmd-Tab during selection cancels and leaves no overlay behind
- ⬜ Changed shortcut persists after restart; conflicting shortcut shows an error
- ⬜ Closing Settings keeps TextPicker running; menu bar *Quit* exits
- ⬜ Launch at Login toggle (Settings and menu) survives logout/login, starts without a window
- ⬜ Second launch from Finder shows Settings, no second instance
- ⬜ Capture HUD appears near the bottom of the active display and fades

### Screenshot editor (macOS)

- ⬜ Screenshot shortcut and tray *Capture Screenshot* open the editor, focused, on the captured display
- ⬜ Setting both shortcuts to the same keys is rejected ("Already used for …")
- ⬜ Pressing the other shortcut while selecting switches mode; the same one cancels
- ⬜ Dock icon appears while the editor is open and disappears after closing; focus returns to the previous app
- ⬜ Capturing again while the editor is open replaces the image and keeps the style
- ⬜ ⌘C pastes into Preview/Slack at native resolution; transparent background stays transparent
- ⬜ ⌘S save dialog writes the PNG; cancel does nothing; ⇧⌘S quick-saves with " 2" suffix on clashes
- ⬜ "Show in Finder" reveals the saved file
- ⬜ Drag handle drops a PNG into Finder, Mail and Slack; cache `drag/` folder is empty after closing
- ⬜ "Your Desktop Pictures" lists only locally installed images and they load quickly
- ⬜ Blur/pixelate hide the content in the exported file
- ⬜ Last style is restored for the next screenshot
- ⬜ Text capture is unchanged (toast, clipboard, focus restore)

### Platform

- ✅ macOS 26 on Apple Silicon (built-in Retina display)
- ⬜ macOS 14 / 15
- ⬜ Intel Mac (universal build)
- ⬜ External display: overlay covers each display incl. menu bar/Dock; selection on each works
- ⬜ Mixed scale (Retina + 1× external), display arranged left of / above the main display
- ⬜ Over a full-screen app (separate Space)
- ⬜ Windows 11 and Windows 10 (2004+ and older): end to end
- ⬜ Windows mixed DPI (100% + 150%), monitor with negative coordinates
- ⬜ Windows without an OCR language installed → clear message, Settings shows guidance

### OCR quality

- ✅ English, Cyrillic/Latin accents, Japanese, code, light-on-dark, small text (Vision, fixtures)
- ⬜ Text in videos, PDFs (Preview/Acrobat), images in browsers
- ⬜ Windows.Media.Ocr on the same content

### Reliability

- ⬜ Rapid repeated shortcut presses
- ⬜ 50+ consecutive captures (memory stable)
- ⬜ Permission denied → Settings explains; granting + relaunch fixes it
- ⬜ Sleep/resume and screen lock during selection
- ⬜ Unplugging a monitor during selection (session ends cleanly)
- ⬜ Clipboard temporarily unavailable → error HUD, app stays usable
