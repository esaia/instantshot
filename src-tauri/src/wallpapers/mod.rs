//! The user's own desktop pictures, offered as editor backgrounds (macOS only for now).
//!
//! Only images that exist locally at full size are listed: most entries in
//! `/System/Library/Desktop Pictures` are `.madesktop` stubs whose images download on demand.
//! The page refers to wallpapers by id only, never by path; Rust decodes and downscales them.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
mod macos;

/// Largest and smallest edge the page may request.
const MAX_PX: u32 = 3200;
const MIN_PX: u32 = 64;
/// Requests up to this size use the bundled thumbnail when there is one.
const THUMB_PX: u32 = 256;
const IMAGE_EXTENSIONS: &[&str] = &["heic", "jpg", "jpeg", "png", "tif", "tiff"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wallpaper {
    pub id: String,
    pub name: String,
    #[serde(skip)]
    path: PathBuf,
    #[serde(skip)]
    thumb: Option<PathBuf>,
}

#[derive(Default)]
pub struct WallpaperState(Mutex<Option<Vec<Wallpaper>>>);

/// Lists wallpapers (cached after the first call). Main thread on macOS (reads the screen).
pub fn list(app: &AppHandle) -> Vec<Wallpaper> {
    let state = app.state::<WallpaperState>();
    let mut cached = state.0.lock().unwrap_or_else(|e| e.into_inner());
    cached.get_or_insert_with(scan).clone()
}

/// Decodes wallpaper `id` scaled to fit `max_px`, in the editor's raw image format.
pub fn image(app: &AppHandle, id: &str, max_px: u32) -> Option<Vec<u8>> {
    let wallpaper = list_cached(app)?.into_iter().find(|w| w.id == id)?;
    let max_px = max_px.clamp(MIN_PX, MAX_PX);
    let source = match &wallpaper.thumb {
        Some(thumb) if max_px <= THUMB_PX => thumb.clone(),
        _ => wallpaper.path.clone(),
    };
    decode(&source, max_px).map(|(w, h, rgba)| crate::editor::encode_raw(w, h, 1.0, &rgba))
}

fn list_cached(app: &AppHandle) -> Option<Vec<Wallpaper>> {
    app.state::<WallpaperState>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[cfg(target_os = "macos")]
fn scan() -> Vec<Wallpaper> {
    let mut found = Vec::new();
    if let Some(current) = macos::current_desktop().filter(|p| is_image(p)) {
        found.push(Wallpaper {
            id: "current".into(),
            name: "Current Desktop".into(),
            thumb: None,
            path: current,
        });
    }
    for dir in macos::DIRECTORIES {
        found.extend(scan_dir(Path::new(dir)));
    }
    dedupe(found)
}

#[cfg(not(target_os = "macos"))]
fn scan() -> Vec<Wallpaper> {
    Vec::new()
}

#[cfg(target_os = "macos")]
fn decode(path: &Path, max_px: u32) -> Option<(u32, u32, Vec<u8>)> {
    macos::decode(path, max_px)
}

#[cfg(not(target_os = "macos"))]
fn decode(_path: &Path, _max_px: u32) -> Option<(u32, u32, Vec<u8>)> {
    None
}

/// Full-size images directly inside `dir`, paired with `.thumbnails/<stem>.heic` if present.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn scan_dir(dir: &Path) -> Vec<Wallpaper> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut items: Vec<Wallpaper> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_image(p))
        .filter_map(|path| {
            let stem = path.file_stem()?.to_string_lossy().into_owned();
            if stem.starts_with('.') || stem.starts_with("Calibrate") {
                return None;
            }
            let thumb = dir.join(".thumbnails").join(format!("{stem}.heic"));
            Some(Wallpaper {
                id: stem.clone(),
                name: stem,
                thumb: thumb.is_file().then_some(thumb),
                path,
            })
        })
        .collect();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Drops entries whose id or path repeats (the current desktop is usually also listed).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn dedupe(items: Vec<Wallpaper>) -> Vec<Wallpaper> {
    let mut seen_ids = std::collections::HashSet::new();
    let mut seen_paths = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|w| seen_paths.insert(w.path.clone()) && seen_ids.insert(w.id.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_image_extensions() {
        assert!(is_image(Path::new("/a/Sonoma.heic")));
        assert!(is_image(Path::new("/a/B.JPG")));
        assert!(!is_image(Path::new("/a/Big Sur.madesktop")));
        assert!(!is_image(Path::new("/a/Solid Colors")));
    }

    #[test]
    fn scans_only_full_images_with_thumbnails() {
        let dir = std::env::temp_dir().join(format!("textpicker-wp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join(".thumbnails")).unwrap();
        std::fs::create_dir_all(dir.join("Solid Colors")).unwrap();
        for f in [
            "B.heic",
            "A.jpg",
            "Stub.madesktop",
            "Calibrate 5120x2880.jpg",
        ] {
            std::fs::write(dir.join(f), b"x").unwrap();
        }
        std::fs::write(dir.join(".thumbnails/B.heic"), b"x").unwrap();
        let found = scan_dir(&dir);
        let names: Vec<_> = found.iter().map(|w| w.name.as_str()).collect();
        assert_eq!(names, ["A", "B"]);
        assert!(found[0].thumb.is_none());
        assert_eq!(found[1].thumb, Some(dir.join(".thumbnails/B.heic")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dedupes_by_path_and_id() {
        let w = |id: &str, path: &str| Wallpaper {
            id: id.into(),
            name: id.into(),
            path: path.into(),
            thumb: None,
        };
        let out = dedupe(vec![
            w("current", "/x/A.heic"),
            w("A", "/x/A.heic"),
            w("B", "/y/B.heic"),
        ]);
        assert_eq!(out.len(), 2);
    }

    /// Decodes a real system wallpaper when one is installed (skipped otherwise).
    #[cfg(target_os = "macos")]
    #[test]
    fn decodes_system_heic_downscaled() {
        let Some(w) = scan_dir(Path::new(macos::DIRECTORIES[0]))
            .into_iter()
            .next()
        else {
            return;
        };
        let started = std::time::Instant::now();
        let (width, height, rgba) = decode(&w.path, 1600).expect("decodes");
        assert!(width.max(height) <= 1600 && width.max(height) >= 800);
        assert_eq!(rgba.len(), (width * height * 4) as usize);
        assert!(rgba.chunks_exact(4).all(|p| p[3] == 255), "opaque");
        eprintln!("{}: {width}x{height} in {:?}", w.name, started.elapsed());
    }
}
