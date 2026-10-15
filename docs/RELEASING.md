# Releasing

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed: a universal
macOS `.dmg` (Apple Silicon + Intel) and a Windows NSIS installer, attached to a draft GitHub
release.

1. Bump `version` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Commit, tag `vX.Y.Z`, and push the tag.
3. When the workflow finishes, review the draft release and publish it.

Installed copies check `latest.json` on the latest published release once a day (and from
**Check for Updates…** in the tray menu or Settings), then ask before installing. Drafts are
invisible to them, so publishing the release is what ships an update.

## Signing secrets

**Never commit signing credentials.** Configure them as repository secrets:

| Secret | Purpose |
|---|---|
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | Base64 `.p12` of a *Developer ID Application* certificate and its password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarization (use an app-specific password) |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the updater private key (`pnpm tauri signer generate`); its public key is `plugins.updater.pubkey` in `tauri.conf.json` |

Without these secrets the macOS build is unsigned and Gatekeeper will block it. Windows builds
are unsigned by default. To sign them, add a code-signing certificate following
[Tauri's Windows signing guide](https://tauri.app/distribute/sign/windows/). The installer
downloads the WebView2 runtime if it's missing (Windows 10).

## Branding

Branding lives in `src-tauri/icons`. The sources are `src-tauri/icons/source/*.svg`; render
`app-icon.svg` to a 1024px PNG and run `pnpm tauri icon src-tauri/icons/app-icon.png`, then
delete the generated `android/` and `ios/` folders. `tray-template.png` is the 44px render of
`tray-template.svg`.

The bundle identifier is `app.instantshot.desktop`. Don't change it after release: macOS ties the
Screen Recording permission and settings to it.
