export interface Settings {
  shortcut: string;
  showNotification: boolean;
  startMinimized: boolean;
  autoLanguage: boolean;
  preserveLineBreaks: boolean;
  onboarded: boolean;
}

export interface AppInfo {
  version: string;
  os: string;
  platform: "macos" | "windows" | string;
  defaultShortcut: string;
  shortcutRegistered: boolean;
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
