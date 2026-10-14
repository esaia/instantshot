// Gaussian-like blur in plain JS: three box-blur passes per axis. Canvas `filter` isn't reliable
// in WebKit, and stretching a tiny image there looks blocky, so this does the real work.

/** Blurs RGBA `pixels` in place with radius `r` (≈ Gaussian sigma × 1.7). */
export function boxBlur3(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  r: number,
): void {
  const radius = Math.max(0, Math.round(r / Math.sqrt(3)));
  if (radius < 1 || width < 2 || height < 2) return;
  const tmp = new Uint8ClampedArray(pixels.length);
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(pixels, tmp, width, height, radius, true);
    blurAxis(tmp, pixels, width, height, radius, false);
  }
}

/** One box blur along rows (`horizontal`) or columns, edges clamped. */
function blurAxis(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const span = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      const at = (i: number) => src[base + Math.min(len - 1, Math.max(0, i)) * step + c];
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += at(i);
      for (let i = 0; i < len; i++) {
        dst[base + i * step + c] = sum / span;
        sum += at(i + radius + 1) - at(i - radius);
      }
    }
  }
}
