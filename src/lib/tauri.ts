// Typed wrappers around the Rust commands. Rust owns all state; the UI only calls these.
// Outside Tauri (a plain browser tab) everything is backed by an in-memory preview instead.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { previewApi, previewListen } from "./preview";
import type {
  AppInfo,
  FinishAction,
  LanguageStatus,
  Markup,
  OverlaySession,
  PermissionState,
  SelectionRect,
  Settings,
  SystemWallpaper,
} from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const tauriApi = {
  // Overlay
  overlaySession: () => invoke<OverlaySession | null>("overlay_session"),
  overlayReady: (session: number) => invoke<void>("overlay_ready", { session }),
  /** The frozen screen behind this overlay (raw RGBA); rejects when it isn't frozen. */
  overlayFrame: () => invoke<ArrayBuffer>("overlay_frame"),
  finishSelection: (session: number, rect: SelectionRect, action?: FinishAction, markup?: Markup) =>
    invoke<void>("finish_selection", {
      session,
      rect,
      action: action ?? null,
      markup: markup ?? null,
    }),
  cancelCapture: (session: number) => invoke<void>("cancel_capture", { session }),

  // Settings
  appInfo: () => invoke<AppInfo>("app_info"),
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
  setShortcut: (shortcut: string) => invoke<Settings>("set_shortcut", { shortcut }),
  setScreenshotShortcut: (shortcut: string) =>
    invoke<Settings>("set_screenshot_shortcut", { shortcut }),
  chooseSaveFolder: () => invoke<Settings>("choose_save_folder"),
  resetSaveFolder: () => invoke<Settings>("reset_save_folder"),
  setShortcutPaused: (paused: boolean) => invoke<void>("set_shortcut_paused", { paused }),
  getLaunchAtLogin: () => invoke<boolean>("get_launch_at_login"),
  setLaunchAtLogin: (enabled: boolean) => invoke<boolean>("set_launch_at_login", { enabled }),

  // Permissions / OCR
  permissionStatus: () => invoke<PermissionState>("permission_status"),
  requestPermission: () => invoke<PermissionState>("request_permission"),
  openPermissionSettings: () => invoke<void>("open_permission_settings"),
  ocrLanguageStatus: () => invoke<LanguageStatus>("ocr_language_status"),
  restartApp: () => invoke<void>("restart_app"),
  checkForUpdates: () => invoke<void>("check_for_updates"),

  // Screenshot editor. Images travel as raw bytes, never JSON.
  editorImage: () => invoke<ArrayBuffer>("editor_image"),
  editorMarkup: () => invoke<unknown[]>("editor_markup"),
  editorReady: () => invoke<void>("editor_ready"),
  copyImage: (png: Uint8Array) => invoke<void>("copy_image", png),
  /** Resolves to the saved path, or null if the dialog was cancelled. */
  saveImage: (png: Uint8Array, name: string) =>
    invoke<string | null>("save_image", png, fileNameHeader(name)),
  quickSave: (png: Uint8Array, name: string) =>
    invoke<string>("quick_save", png, fileNameHeader(name)),
  revealLastSave: () => invoke<void>("reveal_last_save"),
  /** `payload` is built by `dragPayload` (thumbnail + full PNG). */
  startDrag: (payload: Uint8Array, name: string) =>
    invoke<void>("start_drag", payload, fileNameHeader(name)),
  listSystemWallpapers: () => invoke<SystemWallpaper[]>("list_system_wallpapers"),
  wallpaperImage: (id: string, maxPx: number) =>
    invoke<ArrayBuffer>("wallpaper_image", { id, maxPx }),
  getEditorStyle: () => invoke<unknown>("get_editor_style"),
  setEditorStyle: (style: unknown) => invoke<void>("set_editor_style", { style }),
  closeWindow: () => getCurrentWindow().close(),
};

function fileNameHeader(name: string) {
  return { headers: { "x-filename": encodeURIComponent(name) } };
}

export const api: typeof tauriApi = isTauri ? tauriApi : previewApi;

/** Subscribes to a backend event; returns an unsubscribe function. */
export function onEvent<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri) return previewListen(event, handler);
  const unlisten = listen<T>(event, (e) => handler(e.payload));
  return () => {
    void unlisten.then((off) => off());
  };
}

/** The current window's label. In a browser, `?view=overlay|toast|editor` picks a view. */
export function windowLabel(): string {
  if (isTauri) return getCurrentWindow().label;
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "overlay"
    ? "overlay-preview"
    : view === "toast" || view === "editor"
      ? view
      : "settings";
}

export function openExternal(url: string): void {
  if (isTauri) void openUrl(url);
  else window.open(url, "_blank", "noopener");
}

/** Extracts the user-facing message from a rejected command. */
export function errorMessage(err: unknown): string {
  return typeof err === "string"
    ? err
    : err instanceof Error
      ? err.message
      : "Something went wrong";
}
