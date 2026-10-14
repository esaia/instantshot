import type { Annotation, Point } from "../model/types";
import { type Handle, handlesFor } from "./handles";

/** Distance from `p` to the segment `a`–`b`. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hits(a: Annotation, p: Point, tol: number): boolean {
  const reach = tol + a.width / 2;
  switch (a.type) {
    case "arrow":
      return segmentDistance(p, a.from, a.to) <= reach;
    case "text":
    case "blur":
    case "pixelate":
      return (
        p.x >= a.x - tol && p.x <= a.x + a.w + tol && p.y >= a.y - tol && p.y <= a.y + a.h + tol
      );
    case "rect": {
      const inside = (m: number) =>
        p.x >= a.x - m && p.x <= a.x + a.w + m && p.y >= a.y - m && p.y <= a.y + a.h + m;
      // Only the outline is grabbable, so shapes drawn around content don't steal clicks.
      return inside(reach) && !(a.w > 2 * reach && a.h > 2 * reach && inside(-reach));
    }
    case "ellipse": {
      const rx = a.w / 2;
      const ry = a.h / 2;
      if (rx < 1 || ry < 1)
        return segmentDistance(p, { x: a.x, y: a.y }, { x: a.x + a.w, y: a.y + a.h }) <= reach;
      const nx = (p.x - (a.x + rx)) / rx;
      const ny = (p.y - (a.y + ry)) / ry;
      // Approximate distance to the outline in source px.
      return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= reach;
    }
  }
}

/** Topmost annotation under `p` (later annotations are drawn on top). */
export function hitTest(annotations: Annotation[], p: Point, tol: number): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hits(annotations[i], p, tol)) return annotations[i];
  }
  return null;
}

export function handleAt(a: Annotation, p: Point, tol: number): Handle | null {
  return handlesFor(a).find((h) => Math.hypot(h.x - p.x, h.y - p.y) <= tol) ?? null;
}
