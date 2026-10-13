// In-memory stand-in for the Rust backend, used only when the UI is opened in a regular browser
// (e.g. http://localhost:1420) for layout work. Nothing here touches the screen or clipboard.
import type { AppInfo, LanguageStatus, PermissionState, SelectionRect, Settings } from "./types";

const isMac = navigator.userAgent.includes("Mac");
const defaultShortcut = isMac ? "Super+Shift+Digit2" : "Control+Shift+Digit2";

let settings: Settings = {
  shortcut: defaultShortcut,
  showNotification: true,
  startMinimized: false,
  autoLanguage: true,
  preserveLineBreaks: true,
  onboarded: true,
};
let launchAtLogin = false;
let permission: PermissionState = isMac ? "notGranted" : "notRequired";

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

export function previewListen<T>(event: string, handler: (payload: T) => void): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(handler as Handler);
  listeners.set(event, set);
  // Give the toast preview something to show.
  if (event === "toast:show") {
    setTimeout(() => handler({ message: "Copied 42 characters", success: true } as T), 0);
  }
  return () => set.delete(handler as Handler);
}

const resolve = <T>(value: T) => Promise.resolve(value);

export const previewApi = {
  overlaySession: () => resolve<number | null>(1),
  overlayReady: (_session: number) => resolve<void>(undefined),
  finishSelection: (_session: number, rect: SelectionRect) => {
    console.info("[preview] selection", rect);
    return resolve<void>(undefined);
  },
  cancelCapture: (_session: number) => {
    console.info("[preview] cancelled");
    return resolve<void>(undefined);
  },

  appInfo: () =>
    resolve<AppInfo>({
      version: "0.1.0",
      os: "Browser preview",
      platform: isMac ? "macos" : "windows",
      defaultShortcut,
      shortcutRegistered: true,
    }),
  getSettings: () => resolve(settings),
  updateSettings: (next: Settings) => {
    settings = { ...next, shortcut: settings.shortcut };
    return resolve(settings);
  },
  setShortcut: (shortcut: string) => {
    settings = { ...settings, shortcut };
    return resolve(settings);
  },
  setShortcutPaused: (_paused: boolean) => resolve<void>(undefined),
  getLaunchAtLogin: () => resolve(launchAtLogin),
  setLaunchAtLogin: (enabled: boolean) => {
    launchAtLogin = enabled;
    return resolve(enabled);
  },

  permissionStatus: () => resolve(permission),
  requestPermission: () => {
    permission = "granted";
    return resolve(permission);
  },
  openPermissionSettings: () => resolve<void>(undefined),
  ocrLanguageStatus: () =>
    resolve<LanguageStatus>({ available: true, languages: ["en-US", "fr-FR", "de-DE", "ja-JP"] }),
  restartApp: () => resolve<void>(undefined),
};
