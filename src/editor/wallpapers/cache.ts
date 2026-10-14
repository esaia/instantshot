import { api } from "../../lib/tauri";
import { decodeRawFrame, toCanvas } from "../lib/rawFrame";
import { makeCanvas } from "../render/canvas";
import { paintMesh } from "./mesh";
import { wallpaperById } from "./presets";

/** Size generated wallpapers are rendered at; backgrounds are cover-fitted from this. */
const FULL = { width: 1920, height: 1200 };
const THUMB = { width: 112, height: 72 };
/** Longest edge requested for system wallpapers. */
const SYSTEM_PX = 2400;
const SYSTEM_THUMB_PX = 160;

const full = new Map<string, Promise<HTMLCanvasElement | null>>();
const thumbs = new Map<string, Promise<string | null>>();

function render(id: string, size: { width: number; height: number }): HTMLCanvasElement | null {
  const preset = wallpaperById(id);
  if (!preset) return null;
  const canvas = makeCanvas(size.width, size.height);
  // biome-ignore lint/style/noNonNullAssertion: 2d contexts are always available on a new canvas
  paintMesh(canvas.getContext("2d")!, size.width, size.height, preset);
  return canvas;
}

function memo<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let hit = map.get(key);
  if (!hit) {
    hit = load().catch(() => null as T);
    map.set(key, hit);
  }
  return hit;
}

/** Yields first, so drawing a wallpaper never delays the frame that's about to paint. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

export function generatedWallpaper(id: string): Promise<HTMLCanvasElement | null> {
  return memo(full, `gen:${id}`, async () => {
    await nextTask();
    return render(id, FULL);
  });
}

export function generatedThumb(id: string): Promise<string | null> {
  return memo(thumbs, `gen:${id}`, async () => render(id, THUMB)?.toDataURL() ?? null);
}

export function systemWallpaper(id: string): Promise<HTMLCanvasElement | null> {
  return memo(full, `sys:${id}`, async () =>
    toCanvas(decodeRawFrame(await api.wallpaperImage(id, SYSTEM_PX))),
  );
}

export function systemThumb(id: string): Promise<string | null> {
  return memo(thumbs, `sys:${id}`, async () =>
    toCanvas(decodeRawFrame(await api.wallpaperImage(id, SYSTEM_THUMB_PX))).toDataURL(),
  );
}
