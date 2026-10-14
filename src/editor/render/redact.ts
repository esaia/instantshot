import type { Box } from "../model/types";
import { boxBlur3 } from "./blur";
import { context2d, makeCanvas } from "./canvas";

/** Block size for pixelation, source px: coarse enough that text can't be recovered. */
export function pixelBlock(region: Box, scale: number): number {
  return Math.max(8 * scale, Math.min(region.w, region.h) / 8);
}

/**
 * Draws `src` (region of `source`, source px) obscured into `dst` (current ctx units). Both
 * effects downscale first, so the original pixels never reach the output.
 */
export function drawRedacted(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  src: Box,
  dst: Box,
  mode: "blur" | "pixelate",
  scale: number,
): void {
  if (mode === "pixelate") {
    const block = pixelBlock(src, scale);
    const small = makeCanvas(Math.ceil(src.w / block), Math.ceil(src.h / block));
    const s = context2d(small);
    s.imageSmoothingEnabled = true;
    s.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, small.width, small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, dst.x, dst.y, dst.w, dst.h);
    ctx.restore();
    return;
  }
  // Blur: shrink (so the original detail is gone), blur for real, scale back up.
  const down = Math.max(2, Math.min(src.w, src.h) / 60);
  const small = makeCanvas(Math.ceil(src.w / down), Math.ceil(src.h / down));
  const sc = context2d(small);
  sc.imageSmoothingQuality = "high";
  sc.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, small.width, small.height);
  const data = sc.getImageData(0, 0, small.width, small.height);
  boxBlur3(
    data.data,
    small.width,
    small.height,
    Math.max(3, Math.min(small.width, small.height) / 6),
  );
  sc.putImageData(data, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, small.width, small.height, dst.x, dst.y, dst.w, dst.h);
  ctx.restore();
}
