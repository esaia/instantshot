// Main-thread side of render/worker.ts. Every call falls back to doing the work here when the
// worker or OffscreenCanvas isn't available (or fails), so behavior never depends on it.

import type { WorkerRequest, WorkerResponse } from "./worker";

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type Request = WithoutId<WorkerRequest>;

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (res: WorkerResponse) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") {
      worker = null;
      return worker;
    }
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // A worker that can't start (e.g. blocked) is retired; callers fall back.
      for (const done of pending.values()) done({ id: -1, ok: false, error: "worker failed" });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function call(req: Request, transfer: Transferable[] = []): Promise<WorkerResponse> {
  const w = getWorker();
  if (!w) return Promise.resolve({ id: -1, ok: false, error: "no worker" });
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ ...req, id }, transfer);
  });
}

/** A generated wallpaper painted in the worker, or null to paint it here instead. */
export async function meshOffThread(
  preset: string,
  width: number,
  height: number,
): Promise<ImageBitmap | null> {
  const res = await call({ kind: "mesh", preset, width, height });
  return res.ok && res.bitmap ? res.bitmap : null;
}

/** RGBA pixels turned into a drawable image in the worker, or null to do it here instead. */
export async function imageOffThread(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): Promise<ImageBitmap | null> {
  // Copied: `pixels` may view a larger buffer, and the copy can be transferred.
  const copy = new Uint8ClampedArray(pixels);
  const res = await call({ kind: "image", width, height, pixels: copy }, [copy.buffer]);
  return res.ok && res.bitmap ? res.bitmap : null;
}

/** PNG bytes encoded in the worker, or null to encode here instead. */
export async function pngOffThread(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  if (!getWorker()) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(canvas);
  } catch {
    return null;
  }
  const res = await call({ kind: "png", bitmap }, [bitmap]);
  return res.ok && res.bytes ? new Uint8Array(res.bytes) : null;
}
