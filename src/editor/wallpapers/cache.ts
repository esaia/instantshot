import { api } from "../../lib/tauri";
import { decodeRawFrame, toCanvas } from "../lib/rawFrame";
import { makeCanvas } from "../render/canvas";
import { imageOffThread, meshOffThread } from "../render/offthread";
import { paintMesh } from "./mesh";
import { wallpaperById } from "./presets";

/** A decoded background, ready for `drawImage`. */
export type WallpaperImage = HTMLCanvasElement | ImageBitmap;

/** Size generated wallpapers are rendered at; backgrounds are cover-fitted from this. */
const FULL = { width: 1920, height: 1200 };
const THUMB = { width: 112, height: 72 };
/** Longest edge requested for system wallpapers. */
const SYSTEM_PX = 2400;
const SYSTEM_THUMB_PX = 160;
/**
 * Full-size backgrounds kept decoded (≈10–15 MB each). Recently used ones switch back
 * instantly; older ones are dropped so browsing every wallpaper doesn't pile up memory.
 */
const FULL_CACHE_SIZE = 6;

const full = new Map<string, Promise<WallpaperImage | null>>();
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

/** Like `memo`, keeping only the most recently used `FULL_CACHE_SIZE` entries. */
function memoFull(
  key: string,
  load: () => Promise<WallpaperImage | null>,
): Promise<WallpaperImage | null> {
  const hit = full.get(key);
  if (hit) {
    // Re-insert: Map order is the recency order.
    full.delete(key);
    full.set(key, hit);
    return hit;
  }
  const next = load().catch(() => null);
  full.set(key, next);
  // Dropped images may still be on screen; they're released once nothing references them.
  while (full.size > FULL_CACHE_SIZE) full.delete(full.keys().next().value as string);
  return next;
}

/** Yields first, so drawing a wallpaper never delays the frame that's about to paint. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

export function generatedWallpaper(id: string): Promise<WallpaperImage | null> {
  return memoFull(`gen:${id}`, async () => {
    // Painted in a worker: the blurred ribbons take a few hundred ms at this size.
    const bitmap = await meshOffThread(id, FULL.width, FULL.height).catch(() => null);
    if (bitmap) return bitmap;
    await nextTask();
    return render(id, FULL);
  });
}

export function generatedThumb(id: string): Promise<string | null> {
  return memo(thumbs, `gen:${id}`, async () => render(id, THUMB)?.toDataURL() ?? null);
}

export function systemWallpaper(id: string): Promise<WallpaperImage | null> {
  return memoFull(`sys:${id}`, async () => {
    const frame = decodeRawFrame(await api.wallpaperImage(id, SYSTEM_PX));
    const bitmap = await imageOffThread(frame.width, frame.height, frame.pixels).catch(() => null);
    return bitmap ?? toCanvas(frame);
  });
}

export function systemThumb(id: string): Promise<string | null> {
  return memo(thumbs, `sys:${id}`, async () =>
    toCanvas(decodeRawFrame(await api.wallpaperImage(id, SYSTEM_THUMB_PX))).toDataURL(),
  );
}
