import type { Box, Point } from "../model/types";

/** Source rect that covers a `dw`×`dh` destination with an `sw`×`sh` image (centered crop). */
export function coverFit(sw: number, sh: number, dw: number, dh: number): Box {
  const scale = Math.max(dw / sw, dh / sh);
  const w = dw / scale;
  const h = dh / scale;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

/** Endpoints of a CSS `linear-gradient(<angle>deg, …)` across a `w`×`h` box. */
export function gradientLine(angle: number, w: number, h: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

/** Arrow head triangle for a shaft from `from` to `to` drawn with `width`. */
export function arrowHead(from: Point, to: Point, width: number) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const head = Math.min(Math.max(width * 4, 10), len * 0.6);
  const spread = head * 0.62;
  const base = { x: to.x - ux * head, y: to.y - uy * head };
  return {
    tip: to,
    base,
    left: { x: base.x - uy * spread, y: base.y + ux * spread },
    right: { x: base.x + uy * spread, y: base.y - ux * spread },
  };
}

/** Box from two corners in any order. */
export function boxFrom(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

export function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}
