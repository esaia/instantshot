// The one renderer: draws the whole composition for the on-screen preview and for export, so
// what you see is exactly what gets copied or saved.

import { bounds, handlesFor } from "../interaction/handles";
import { NO_CROP } from "../model/defaults";
import type { Annotation, Box, Crop, Doc, EditorStyle, SourceImage } from "../model/types";
import { gradientById } from "../presets/gradients";
import { drawAnnotation } from "./annotations";
import { boxBlur3 } from "./blur";
import { context2d, makeCanvas } from "./canvas";
import { CHROME_COLORS, drawChrome } from "./chrome";
import {
  boxCenter,
  coverFit,
  gradientLine,
  intersect,
  rotatedBounds,
  rotatedCorners,
  rotatePoint,
} from "./geometry";
import { computeLayout, type Layout } from "./layout";
import { drawRedacted } from "./redact";

export interface RenderAssets {
  source: SourceImage;
  /** Decoded image for wallpaper/system/custom backgrounds; null while loading. */
  background: CanvasImageSource | null;
  backgroundSize: { width: number; height: number } | null;
}

export interface RenderOptions {
  /** Output pixels per logical px. */
  scale: number;
  /** Shape being drawn right now. */
  draft?: Annotation | null;
  /** Annotation hidden from the canvas (text being edited). */
  hiddenId?: string | null;
  /** Preview only: outline and handles for the selection, in output pixels. */
  selectedId?: string | null;
  handleSize?: number;
}

/** The source region shown: the capture minus the cropped edges, whole source px. */
export function sourceCrop(source: SourceImage, c: Crop = NO_CROP): Box {
  const x = Math.round(source.width * c.left);
  const y = Math.round(source.height * c.top);
  const w = Math.max(1, Math.round(source.width * (1 - c.right)) - x);
  const h = Math.max(1, Math.round(source.height * (1 - c.bottom)) - y);
  return { x, y, w, h };
}

export function layoutFor(source: SourceImage, style: EditorStyle): { layout: Layout; crop: Box } {
  const crop = sourceCrop(source, style.crop);
  return { crop, layout: computeLayout(crop.w / source.scale, crop.h / source.scale, style) };
}

const FALLBACK_BACKGROUND = "#c7c9d1";

function drawBackground(
  ctx: CanvasRenderingContext2D,
  style: EditorStyle,
  assets: RenderAssets,
  w: number,
  h: number,
): void {
  const bg = style.background;
  switch (bg.kind) {
    case "none":
      return;
    case "solid":
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      return;
    case "gradient": {
      const preset = gradientById(bg.id);
      if (!preset) break;
      const line = gradientLine(preset.angle, w, h);
      const g = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
      preset.stops.forEach((c, i) => {
        g.addColorStop(preset.stops.length === 1 ? 0 : i / (preset.stops.length - 1), c);
      });
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    default:
      if (assets.background && assets.backgroundSize) {
        const s = assets.backgroundSize;
        const src = coverFit(s.width, s.height, w, h);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(assets.background, src.x, src.y, src.w, src.h, 0, 0, w, h);
        return;
      }
  }
  ctx.fillStyle = FALLBACK_BACKGROUND;
  ctx.fillRect(0, 0, w, h);
}

/** Last blurred background, reused while only annotations or the frame change. */
let blurCache: { key: string; image: CanvasImageSource | null; canvas: HTMLCanvasElement } | null =
  null;

/**
 * Background blur: render the background at reduced size (at most 8× smaller), blur that with a
 * real Gaussian-like filter, then draw it scaled up. The small upscale keeps it smooth.
 */
function drawBlurredBackground(
  ctx: CanvasRenderingContext2D,
  style: EditorStyle,
  assets: RenderAssets,
  w: number,
  h: number,
  scale: number,
): void {
  const radius = style.backgroundBlur * scale;
  const down = Math.min(8, Math.max(1, radius / 6));
  const sw = Math.max(1, Math.round((w * scale) / down));
  const sh = Math.max(1, Math.round((h * scale) / down));
  const key = `${JSON.stringify(style.background)}|${sw}x${sh}|${radius / down}`;
  let canvas =
    blurCache?.key === key && blurCache.image === assets.background ? blurCache.canvas : null;
  if (!canvas) {
    canvas = makeCanvas(sw, sh);
    const sctx = context2d(canvas);
    sctx.scale(sw / w, sh / h);
    sctx.imageSmoothingQuality = "high";
    drawBackground(sctx, style, assets, w, h);
    const data = sctx.getImageData(0, 0, sw, sh);
    boxBlur3(data.data, sw, sh, radius / down);
    sctx.putImageData(data, 0, 0);
    blurCache = { key, image: assets.background, canvas };
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  ctx.restore();
}

const isRedaction = (a: Annotation) => a.type === "blur" || a.type === "pixelate";

/** Renders `doc` into `ctx`, whose canvas must be `layout × opts.scale` pixels. */
export function renderComposition(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  assets: RenderAssets,
  opts: RenderOptions,
): void {
  const { style } = doc;
  const { source } = assets;
  const { layout, crop } = layoutFor(source, style);
  const { frame, image } = layout;
  const s = opts.scale;
  const radius = Math.min(style.radius, frame.w / 2, frame.h / 2);
  const annotations = [...doc.annotations, ...(opts.draft ? [opts.draft] : [])].filter(
    (a) => a.id !== opts.hiddenId,
  );

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const bgKind = style.background.kind;
  if (style.backgroundBlur > 0 && bgKind !== "none" && bgKind !== "solid") {
    drawBlurredBackground(ctx, style, assets, layout.width, layout.height, s);
  } else {
    drawBackground(ctx, style, assets, layout.width, layout.height);
  }

  // Shadow: cast by an opaque copy of the frame (shadow sizes are in output pixels).
  if (style.shadow > 0 && style.shadowOpacity > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${style.shadowOpacity})`;
    ctx.shadowBlur = style.shadow * s;
    ctx.shadowOffsetY = style.shadow * 0.3 * s;
    ctx.fillStyle = source.edgeColor;
    ctx.beginPath();
    ctx.roundRect(frame.x, frame.y, frame.w, frame.h, radius);
    ctx.fill();
    ctx.restore();
  }

  // Frame contents, clipped to the rounded window.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, radius);
  ctx.clip();
  ctx.fillStyle =
    style.chrome === "none" || style.inset > 0 ? source.edgeColor : CHROME_COLORS[style.chrome].bar;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  if (style.chrome !== "none") drawChrome(ctx, frame, layout.chromeHeight, style.chrome);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source.bitmap, crop.x, crop.y, crop.w, crop.h, image.x, image.y, image.w, image.h);

  // From here on draw in source pixels.
  const k = image.w / crop.w;
  const toSource = () =>
    ctx.setTransform(s * k, 0, 0, s * k, s * (image.x - crop.x * k), s * (image.y - crop.y * k));
  toSource();
  ctx.beginPath();
  ctx.rect(crop.x, crop.y, crop.w, crop.h);
  ctx.clip();
  for (const a of annotations) {
    if (a.type !== "blur" && a.type !== "pixelate") continue;
    const angle = a.rotation ?? 0;
    const region = intersect(rotatedBounds(a, angle), crop);
    if (!region) continue;
    if (!angle) {
      drawRedacted(ctx, source.bitmap, region, region, a.type, source.scale);
      continue;
    }
    // Rotated: obscure the covering upright area, clipped to the rotated shape.
    ctx.save();
    ctx.beginPath();
    for (const [i, p] of rotatedCorners(a, angle).entries()) {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.clip();
    drawRedacted(ctx, source.bitmap, region, region, a.type, source.scale);
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  toSource();
  for (const a of annotations) if (!isRedaction(a)) drawAnnotation(ctx, a);
  ctx.restore();

  const selected = opts.selectedId ? annotations.find((a) => a.id === opts.selectedId) : null;
  if (selected) {
    drawSelection(
      ctx,
      selected,
      (x, y) => ({
        x: s * ((x - crop.x) * k + image.x),
        y: s * ((y - crop.y) * k + image.y),
      }),
      opts.handleSize ?? 8,
      1 / (s * k),
    );
  }
}

/** Distance of the rotate handle above a selected box, in handle sizes. */
export const ROTATE_HANDLE_GAP = 3;

/**
 * Dashed outline and handles, drawn in output pixels so they don't scale. `srcPerOut` converts
 * output px back to source px (for the outline margin and the rotate handle's distance).
 */
function drawSelection(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  toOut: (x: number, y: number) => { x: number; y: number },
  size: number,
  srcPerOut: number,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const rotateOffset =
    a.type === "arrow" || a.type === "pen" ? 0 : size * ROTATE_HANDLE_GAP * srcPerOut;
  const handles = handlesFor(a, rotateOffset);
  if (a.type !== "arrow") {
    // A stroke's outline also clears its line width.
    const pad = (size / 2) * srcPerOut + (a.type === "pen" ? a.width / 2 : 0);
    const b = bounds(a);
    const outline = rotatedCorners(
      { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad },
      a.type === "pen" ? 0 : (a.rotation ?? 0),
    ).map((p) => toOut(p.x, p.y));
    const path = () => {
      ctx.beginPath();
      for (const [i, p] of outline.entries()) {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    ctx.setLineDash([size * 0.6, size * 0.5]);
    ctx.lineWidth = size / 8;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    path();
    ctx.stroke();
    ctx.lineDashOffset = size * 0.55;
    ctx.strokeStyle = "rgba(10,132,255,0.95)";
    path();
    ctx.stroke();
    ctx.setLineDash([]);

    // Stem from the top edge to the rotate handle.
    const rot = handles.find((h) => h.id === "rotate");
    if (rot) {
      const top = toOut(...topMid(a));
      const r = toOut(rot.x, rot.y);
      ctx.strokeStyle = "rgba(10,132,255,0.95)";
      ctx.lineWidth = size / 6;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
  }
  for (const h of handles) {
    const p = toOut(h.x, h.y);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0a84ff";
    ctx.lineWidth = size / 5;
    ctx.beginPath();
    if (h.id === "rotate") ctx.arc(p.x, p.y, size * 0.6, 0, Math.PI * 2);
    else ctx.roundRect(p.x - size / 2, p.y - size / 2, size, size, size / 4);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Middle of a box's (rotated) top edge. */
function topMid(a: Annotation): [number, number] {
  if (a.type === "arrow") return [a.to.x, a.to.y];
  if (a.type === "pen") {
    const b = bounds(a);
    return [b.x + b.w / 2, b.y];
  }
  const p = rotatePoint({ x: a.x + a.w / 2, y: a.y }, boxCenter(a), a.rotation ?? 0);
  return [p.x, p.y];
}
