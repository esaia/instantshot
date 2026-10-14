// In-memory stand-in for the Rust backend, used only when the UI is opened in a regular browser
// (e.g. http://localhost:1420) for layout work. Nothing here touches the screen; the editor gets
// a synthetic screenshot, saves become downloads, and copy uses the browser clipboard.
import { encodeRawFrame } from "../editor/lib/rawFrame";
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

const isMac = navigator.userAgent.includes("Mac");
const defaultShortcut = isMac ? "Super+Shift+Digit2" : "Control+Shift+Digit2";
const defaultScreenshotShortcut = isMac ? "Super+Shift+Digit1" : "Control+Shift+Digit1";

let settings: Settings = {
  shortcut: defaultShortcut,
  showNotification: true,
  startMinimized: false,
  autoLanguage: true,
  preserveLineBreaks: true,
  onboarded: true,
  screenshotShortcut: defaultScreenshotShortcut,
  saveFolder: null,
};
let editorStyle: unknown = null;
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
  overlaySession: () =>
    resolve<OverlaySession | null>({
      session: 1,
      mode:
        new URLSearchParams(window.location.search).get("mode") === "text" ? "text" : "screenshot",
    }),
  overlayReady: (_session: number) => resolve<void>(undefined),
  overlayFrame: () => Promise.reject<ArrayBuffer>(new Error("not frozen in preview")),
  finishSelection: (
    _session: number,
    rect: SelectionRect,
    action?: FinishAction,
    markup?: Markup,
  ) => {
    console.info("[preview] selection", rect, action, markup?.annotations);
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
      defaultScreenshotShortcut,
      screenshotShortcutRegistered: true,
      saveFolder: settings.saveFolder ?? "~/Desktop",
    }),
  getSettings: () => resolve(settings),
  updateSettings: (next: Settings) => {
    settings = {
      ...next,
      shortcut: settings.shortcut,
      screenshotShortcut: settings.screenshotShortcut,
      saveFolder: settings.saveFolder,
    };
    return resolve(settings);
  },
  setShortcut: (shortcut: string) => {
    if (shortcut === settings.screenshotShortcut) {
      return Promise.reject("Already used for Capture Screenshot");
    }
    settings = { ...settings, shortcut };
    return resolve(settings);
  },
  setScreenshotShortcut: (shortcut: string) => {
    if (shortcut === settings.shortcut) return Promise.reject("Already used for Capture Text");
    settings = { ...settings, screenshotShortcut: shortcut };
    return resolve(settings);
  },
  chooseSaveFolder: () => {
    settings = { ...settings, saveFolder: "~/Pictures/Screenshots" };
    return resolve(settings);
  },
  resetSaveFolder: () => {
    settings = { ...settings, saveFolder: null };
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

  editorImage: () => resolve(encodeRawFrame(sampleScreenshot())),
  editorMarkup: () => resolve<unknown[]>([]),
  editorReady: () => resolve<void>(undefined),
  copyImage: async (png: Uint8Array) => {
    const blob = new Blob([png as BlobPart], { type: "image/png" });
    await navigator.clipboard?.write([new ClipboardItem({ "image/png": blob })]);
  },
  saveImage: (png: Uint8Array, name: string) => {
    download(png, name);
    return resolve<string | null>(`~/Downloads/${name}`);
  },
  quickSave: (png: Uint8Array, name: string) => {
    download(png, name);
    return resolve(`~/Downloads/${name}`);
  },
  revealLastSave: () => resolve<void>(undefined),
  startDrag: (_payload: Uint8Array, _name: string) => resolve<void>(undefined),
  listSystemWallpapers: () => resolve<SystemWallpaper[]>([]),
  wallpaperImage: (_id: string, _maxPx: number) =>
    Promise.reject<ArrayBuffer>("No system wallpapers in the browser preview"),
  getEditorStyle: () => resolve(editorStyle),
  setEditorStyle: (style: unknown) => {
    editorStyle = style;
    return resolve<void>(undefined);
  },
  closeWindow: () => resolve<void>(undefined),
};

function download(png: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A fake app window to edit in the browser preview (drawn at 2x). */
function sampleScreenshot() {
  const scale = 2;
  const w = 520;
  const h = 340;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  // biome-ignore lint/style/noNonNullAssertion: 2d contexts are always available on a new canvas
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, 52);
  ctx.fillStyle = "#6d5dfc";
  ctx.beginPath();
  ctx.roundRect(20, 14, 24, 24, 6);
  ctx.fill();
  ctx.font = "600 15px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#111827";
  ctx.fillText("Acme", 54, 31);
  ctx.fillStyle = "#6b7280";
  ctx.font = "500 13px -apple-system, system-ui, sans-serif";
  ctx.fillText("Overview      Reports", 120, 31);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(20, 70, w - 40, 160, 12);
  ctx.fill();
  ctx.fillStyle = "#6b7280";
  ctx.fillText("Monthly revenue", 38, 98);
  ctx.fillStyle = "#111827";
  ctx.font = "700 30px -apple-system, system-ui, sans-serif";
  ctx.fillText("$128.4k", 38, 134);
  ctx.strokeStyle = "#6d5dfc";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = 38 + i * ((w - 76) / 20);
    const y = 200 - i * 2.2 - Math.sin(i * 0.9) * 8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (const [i, [label, value]] of [
    ["Active users", "8,214"],
    ["Conversion", "3.8%"],
  ].entries()) {
    const x = 20 + i * ((w - 30) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, 246, (w - 50) / 2, 74, 12);
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 13px -apple-system, system-ui, sans-serif";
    ctx.fillText(label, x + 18, 272);
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px -apple-system, system-ui, sans-serif";
    ctx.fillText(value, x + 18, 302);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, scale, pixels };
}
