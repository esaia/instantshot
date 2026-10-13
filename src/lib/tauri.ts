// Typed wrappers around the Rust commands. Rust owns all state; the UI only calls these.
// Outside Tauri (a plain browser tab) everything is backed by an in-memory preview instead.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { previewApi, previewListen } from "./preview";
import type { AppInfo, LanguageStatus, PermissionState, SelectionRect, Settings } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const tauriApi = {
  // Overlay
  overlaySession: () => invoke<number | null>("overlay_session"),
  overlayReady: (session: number) => invoke<void>("overlay_ready", { session }),
  finishSelection: (session: number, rect: SelectionRect) =>
    invoke<void>("finish_selection", { session, rect }),
  cancelCapture: (session: number) => invoke<void>("cancel_capture", { session }),

  // Settings
  appInfo: () => invoke<AppInfo>("app_info"),
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) => invoke<Settings>("update_settings", { settings }),
  setShortcut: (shortcut: string) => invoke<Settings>("set_shortcut", { shortcut }),
  setShortcutPaused: (paused: boolean) => invoke<void>("set_shortcut_paused", { paused }),
  getLaunchAtLogin: () => invoke<boolean>("get_launch_at_login"),
  setLaunchAtLogin: (enabled: boolean) => invoke<boolean>("set_launch_at_login", { enabled }),

  // Permissions / OCR
  permissionStatus: () => invoke<PermissionState>("permission_status"),
  requestPermission: () => invoke<PermissionState>("request_permission"),
  openPermissionSettings: () => invoke<void>("open_permission_settings"),
  ocrLanguageStatus: () => invoke<LanguageStatus>("ocr_language_status"),
  restartApp: () => invoke<void>("restart_app"),
};

export const api: typeof tauriApi = isTauri ? tauriApi : previewApi;

/** Subscribes to a backend event; returns an unsubscribe function. */
export function onEvent<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri) return previewListen(event, handler);
  const unlisten = listen<T>(event, (e) => handler(e.payload));
  return () => {
    void unlisten.then((off) => off());
  };
}

/** The current window's label. In a browser, `?view=overlay|toast` picks a view to preview. */
export function windowLabel(): string {
  if (isTauri) return getCurrentWindow().label;
  const view = new URLSearchParams(window.location.search).get("view");
  return view === "overlay" ? "overlay-preview" : view === "toast" ? "toast" : "settings";
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
