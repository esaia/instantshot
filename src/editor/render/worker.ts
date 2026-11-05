// Off-main-thread canvas work for the editor: painting generated wallpapers and PNG encoding.
// Both used to block the UI for hundreds of ms, which made switching backgrounds stutter.

import { paintMesh } from "../wallpapers/mesh";
import { wallpaperById } from "../wallpapers/presets";

export type WorkerRequest =
  | { id: number; kind: "mesh"; preset: string; width: number; height: number }
  | { id: number; kind: "png"; bitmap: ImageBitmap }
  | {
      id: number;
      kind: "image";
      width: number;
      height: number;
      pixels: Uint8ClampedArray<ArrayBuffer>;
    };

export type WorkerResponse =
  | { id: number; ok: true; bitmap?: ImageBitmap; bytes?: ArrayBuffer }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  switch (req.kind) {
    case "mesh": {
      const preset = wallpaperById(req.preset);
      if (!preset) throw new Error(`unknown wallpaper ${req.preset}`);
      const canvas = new OffscreenCanvas(req.width, req.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      paintMesh(ctx, req.width, req.height, preset);
      return { id: req.id, ok: true, bitmap: canvas.transferToImageBitmap() };
    }
    case "image": {
      const canvas = new OffscreenCanvas(req.width, req.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.putImageData(new ImageData(req.pixels, req.width), 0, 0);
      return { id: req.id, ok: true, bitmap: canvas.transferToImageBitmap() };
    }
    case "png": {
      const { bitmap } = req;
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return { id: req.id, ok: true, bytes: await blob.arrayBuffer() };
    }
  }
}

scope.onmessage = (e) => {
  handle(e.data).then(
    (res) => {
      const transfer: Transferable[] = [];
      if (res.ok && res.bitmap) transfer.push(res.bitmap);
      if (res.ok && res.bytes) transfer.push(res.bytes);
      scope.postMessage(res, transfer);
    },
    (err) => scope.postMessage({ id: e.data.id, ok: false, error: String(err) }),
  );
};
