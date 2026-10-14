export interface Settings {
  shortcut: string;
  showNotification: boolean;
  startMinimized: boolean;
  autoLanguage: boolean;
  preserveLineBreaks: boolean;
  onboarded: boolean;
  screenshotShortcut: string;
  /** Quick-save folder; null means the Desktop. */
  saveFolder: string | null;
}

export interface AppInfo {
  version: string;
  os: string;
  platform: "macos" | "windows" | string;
  defaultShortcut: string;
  shortcutRegistered: boolean;
  defaultScreenshotShortcut: string;
  screenshotShortcutRegistered: boolean;
  /** Resolved quick-save folder (the configured one or the Desktop). */
  saveFolder: string | null;
}

export type PermissionState = "granted" | "notGranted" | "notRequired";

export interface LanguageStatus {
  available: boolean;
  languages: string[];
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ToastPayload {
  message: string;
  success: boolean;
}

/** A desktop picture installed on this Mac, offered as an editor background. */
export interface SystemWallpaper {
  id: string;
  name: string;
}

export type CaptureMode = "text" | "screenshot";

export interface OverlaySession {
  session: number;
  mode: CaptureMode;
}

/** What a confirmed screenshot selection does. */
export type FinishAction = "copy" | "edit";
