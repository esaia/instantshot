//! Exporting the composed screenshot. The editor renders the final PNG and sends it as the raw IPC
//! body (no JSON/base64), with the suggested file name URI-encoded in the `x-filename` header.
//! File paths never come from the page: Rust picks them (dialog, settings, cache dir).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::settings;

const FILENAME_HEADER: &str = "x-filename";
const DEFAULT_NAME: &str = "Screenshot.png";
const DRAG_DIR: &str = "drag";

/// Path of the most recent save, for "Show in Finder".
#[derive(Default)]
pub struct LastSave(Mutex<Option<PathBuf>>);

fn body(request: &Request<'_>) -> Result<Vec<u8>, AppError> {
    match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() => Ok(bytes.clone()),
        _ => Err(AppError::msg("No image to export")),
    }
}

fn file_name(request: &Request<'_>) -> String {
    let raw = request
        .headers()
        .get(FILENAME_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    sanitize_file_name(&percent_decode(raw))
}

fn remember(app: &AppHandle, path: &Path) {
    *app.state::<LastSave>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some(path.to_path_buf());
}

pub async fn copy_image(app: &AppHandle, request: &Request<'_>) -> Result<(), AppError> {
    let png = body(request)?;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let image = tauri::image::Image::from_bytes(&png).map_err(|e| {
            log::error!("decoding export PNG failed: {e}");
            AppError::msg("Couldn't copy the image")
        })?;
        app.clipboard().write_image(&image).map_err(|e| {
            log::error!("clipboard image write failed: {e}");
            AppError::msg("Couldn't access the clipboard")
        })
    })
    .await
    .map_err(|_| AppError::msg("Couldn't copy the image"))?
}

/// Asks where to save. Returns the path, or `None` if the user cancelled.
pub async fn save_image(
    app: &AppHandle,
    window: &WebviewWindow,
    request: &Request<'_>,
) -> Result<Option<String>, AppError> {
    let png = body(request)?;
    let name = file_name(request);
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(window)
        .set_title("Save Screenshot")
        .set_file_name(name)
        .add_filter("PNG Image", &["png"]);
    if let Some(dir) = settings::save_folder(app) {
        dialog = dialog.set_directory(dir);
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|_| AppError::msg("That location can't be used"))?;
        write(&path, &png)?;
        remember(&app, &path);
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|_| AppError::msg("Couldn't save the image"))?
}

/// Saves straight into the configured folder (Desktop by default) under a unique name.
pub async fn quick_save(app: &AppHandle, request: &Request<'_>) -> Result<String, AppError> {
    let png = body(request)?;
    let name = file_name(request);
    let dir = settings::save_folder(app).ok_or_else(|| AppError::msg("No save folder"))?;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = unique_path(&dir, &name);
        write(&path, &png)?;
        remember(&app, &path);
        Ok(path.display().to_string())
    })
    .await
    .map_err(|_| AppError::msg("Couldn't save the image"))?
}

pub fn reveal_last_save(app: &AppHandle) -> Result<(), AppError> {
    let path = app
        .state::<LastSave>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| AppError::msg("Nothing saved yet"))?;
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|_| AppError::msg("Couldn't open the folder"))
}

/// Starts dragging the composed image out of the editor as a PNG file. Must be called while the
/// mouse button is down (from the page's `dragstart`).
pub async fn start_drag(
    app: &AppHandle,
    window: &WebviewWindow,
    request: &Request<'_>,
) -> Result<(), AppError> {
    let body = body(request)?;
    let (thumb, png) =
        parse_drag_body(&body).ok_or_else(|| AppError::msg("Invalid drag payload"))?;
    let dir = drag_dir(app).ok_or_else(|| AppError::msg("No cache folder"))?;
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|_| AppError::msg("Couldn't prepare the drag"))?;
    let path = dir.join(file_name(request));
    write(&path, png)?;

    let thumb = thumb.to_vec();
    let window = window.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = drag::start_drag(
            &window,
            drag::DragItem::Files(vec![path]),
            drag::Image::Raw(thumb),
            |_, _| {},
            drag::Options::default(),
        ) {
            log::error!("drag failed: {err}");
        }
    })
    .map_err(|_| AppError::msg("Couldn't start the drag"))
}

fn drag_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|d| d.join(DRAG_DIR))
}

/// Removes temporary drag files (editor closed, app start).
pub fn clear_drag_dir(app: &AppHandle) {
    if let Some(dir) = drag_dir(app) {
        let _ = std::fs::remove_dir_all(dir);
    }
}

fn write(path: &Path, png: &[u8]) -> Result<(), AppError> {
    std::fs::write(path, png).map_err(|e| {
        log::error!("writing {} failed: {e}", path.display());
        AppError::msg("Couldn't save the image")
    })
}

/// Splits `[u32 LE thumbnail length][thumbnail PNG][full PNG]`.
pub fn parse_drag_body(body: &[u8]) -> Option<(&[u8], &[u8])> {
    let len = u32::from_le_bytes(body.get(..4)?.try_into().ok()?) as usize;
    let thumb = body.get(4..4usize.checked_add(len)?)?;
    let full = &body[4 + len..];
    (!thumb.is_empty() && !full.is_empty()).then_some((thumb, full))
}

/// Decodes `%XX` escapes (as produced by `encodeURIComponent`). Invalid UTF-8 is replaced.
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| (b as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A safe file name: no directories, reserved or control characters, or leading dots; always
/// ends in `.png`.
pub fn sanitize_file_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let cleaned = cleaned.trim();
    let stem = cleaned
        .strip_suffix(".png")
        .or_else(|| cleaned.strip_suffix(".PNG"))
        .unwrap_or(cleaned)
        .trim_start_matches('.')
        .trim();
    if stem.is_empty() {
        DEFAULT_NAME.to_string()
    } else {
        let stem: String = stem.chars().take(200).collect();
        format!("{stem}.png")
    }
}

/// `dir/name`, or `dir/name 2.png`, `dir/name 3.png`, … if taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let stem = name.strip_suffix(".png").unwrap_or(name);
    (2..)
        .map(|n| dir.join(format!("{stem} {n}.png")))
        .find(|p| !p.exists())
        .expect("unbounded search")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_file_name("Shot.png"), "Shot.png");
        assert_eq!(sanitize_file_name("Shot"), "Shot.png");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd.png");
        assert_eq!(sanitize_file_name("C:\\x\\a:b*c?.png"), "abc.png");
        assert_eq!(sanitize_file_name(".hidden"), "hidden.png");
        assert_eq!(sanitize_file_name("  "), DEFAULT_NAME);
        assert_eq!(sanitize_file_name(".png"), DEFAULT_NAME);
        assert_eq!(sanitize_file_name("a\u{0}b\nc.png"), "abc.png");
    }

    #[test]
    fn decodes_uri_components() {
        assert_eq!(
            percent_decode("TextPicker%202026-10-14%20at%2015.04.12.png"),
            "TextPicker 2026-10-14 at 15.04.12.png"
        );
        assert_eq!(percent_decode("%E1%83%90.png"), "ა.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn unique_paths_append_numbers() {
        let dir = std::env::temp_dir().join(format!("textpicker-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "a.png"), dir.join("a.png"));
        std::fs::write(dir.join("a.png"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "a.png"), dir.join("a 2.png"));
        std::fs::write(dir.join("a 2.png"), b"x").unwrap();
        assert_eq!(unique_path(&dir, "a.png"), dir.join("a 3.png"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_drag_bodies() {
        let mut body = 3u32.to_le_bytes().to_vec();
        body.extend_from_slice(b"abcFULL");
        assert_eq!(parse_drag_body(&body), Some((&b"abc"[..], &b"FULL"[..])));
        assert_eq!(parse_drag_body(&[1, 0]), None);
        let mut short = 10u32.to_le_bytes().to_vec();
        short.extend_from_slice(b"abc");
        assert_eq!(parse_drag_body(&short), None);
        let mut empty_full = 3u32.to_le_bytes().to_vec();
        empty_full.extend_from_slice(b"abc");
        assert_eq!(parse_drag_body(&empty_full), None);
    }
}
