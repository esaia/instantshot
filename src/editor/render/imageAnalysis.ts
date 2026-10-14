type Rgb = [number, number, number];

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Most common color along the image border (4-bit buckets, averaged), as `#rrggbb`. */
export function edgeColor(pixels: Uint8ClampedArray, width: number, height: number): string {
  return hex(edgeRgb(pixels, width, height));
}

function edgeRgb(pixels: Uint8ClampedArray, width: number, height: number): Rgb {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor((width + height) / 400));
  const visit = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    s.n++;
    s.r += r;
    s.g += g;
    s.b += b;
    buckets.set(key, s);
  };
  for (let x = 0; x < width; x += step) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    visit(0, y);
    visit(width - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  for (const s of buckets.values()) if (s.n > best.n) best = s;
  return best.n === 0 ? [255, 255, 255] : [best.r / best.n, best.g / best.n, best.b / best.n];
}
