import type { WallpaperPreset } from "./presets";

export interface Ribbon {
  /** Start, control and end points of the ribbon's spine (relative 0–1). */
  points: [number, number, number, number, number, number, number, number];
  /** Thickness relative to the shorter side. */
  width: number;
  color: string;
  alpha: number;
}

export interface Blob {
  /** Center and radius relative to the canvas (0–1, radius relative to the longer side). */
  x: number;
  y: number;
  r: number;
  color: string;
  /** Peak opacity. */
  alpha: number;
}

/** Small deterministic PRNG, so a wallpaper looks the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The color fields of a wallpaper: every palette color at least once, at seeded positions. */
export function meshSpec(preset: WallpaperPreset): Blob[] {
  const rand = mulberry32(preset.seed);
  const count = preset.palette.length + 2;
  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push({
      x: -0.15 + rand() * 1.3,
      y: -0.15 + rand() * 1.3,
      r: 0.3 + rand() * 0.35,
      color: preset.palette[i % preset.palette.length],
      alpha: 0.65 + rand() * 0.35,
    });
  }
  return blobs;
}

/** Two soft, sweeping bands that give the wallpaper a "silk" macOS look. */
export function ribbonSpec(preset: WallpaperPreset): Ribbon[] {
  const rand = mulberry32(preset.seed * 7 + 3);
  return [0, 1].map((i) => {
    const y0 = 0.2 + rand() * 0.6;
    const y1 = 0.2 + rand() * 0.6;
    return {
      points: [
        -0.1,
        y0,
        0.3 + rand() * 0.2,
        y0 + (rand() - 0.5) * 0.9,
        0.6 + rand() * 0.2,
        y1 + (rand() - 0.5) * 0.9,
        1.1,
        y1,
      ],
      width: 0.12 + rand() * 0.18,
      color: preset.palette[(i * 2 + 1) % preset.palette.length],
      alpha: 0.55 + rand() * 0.3,
    };
  });
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Draws the wallpaper at full resolution: radial color fields, then ribbons blurred with the
 * canvas shadow trick (the stroke itself is drawn off-canvas, only its blurred shadow lands),
 * which gives a smooth Gaussian blur in every engine.
 */
export function paintMesh(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  preset: WallpaperPreset,
): void {
  const side = Math.max(w, h);
  const short = Math.min(w, h);
  ctx.save();
  ctx.fillStyle = preset.base;
  ctx.fillRect(0, 0, w, h);
  for (const b of meshSpec(preset)) {
    const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * side);
    g.addColorStop(0, rgba(b.color, b.alpha));
    g.addColorStop(0.4, rgba(b.color, b.alpha * 0.7));
    g.addColorStop(1, rgba(b.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const offset = w * 4;
  ctx.lineCap = "round";
  const blurredStroke = (r: Ribbon, color: string, width: number, blur: number) => {
    const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = r.points;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = offset;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0 * w - offset, y0 * h);
    ctx.bezierCurveTo(
      cx1 * w - offset,
      cy1 * h,
      cx2 * w - offset,
      cy2 * h,
      x1 * w - offset,
      y1 * h,
    );
    ctx.stroke();
  };
  for (const r of ribbonSpec(preset)) {
    const width = r.width * short;
    blurredStroke(r, rgba(r.color, r.alpha), width, width * 0.5);
    // A soft highlight along the ribbon.
    blurredStroke(r, rgba("#ffffff", 0.22), width * 0.12, width * 0.12);
  }
  ctx.restore();
}
