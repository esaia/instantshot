import type { Annotation, Box, Point } from "../model/types";

export type HandleId = "from" | "to" | "nw" | "ne" | "sw" | "se";

export interface Handle extends Point {
  id: HandleId;
}

/** Bounding box of an annotation, source px. */
export function bounds(a: Annotation): Box {
  if (a.type === "arrow") {
    return {
      x: Math.min(a.from.x, a.to.x),
      y: Math.min(a.from.y, a.to.y),
      w: Math.abs(a.to.x - a.from.x),
      h: Math.abs(a.to.y - a.from.y),
    };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

/** Resize handles of a selected annotation. Text only moves. */
export function handlesFor(a: Annotation): Handle[] {
  if (a.type === "arrow") {
    return [
      { id: "from", ...a.from },
      { id: "to", ...a.to },
    ];
  }
  if (a.type === "text") return [];
  return [
    { id: "nw", x: a.x, y: a.y },
    { id: "ne", x: a.x + a.w, y: a.y },
    { id: "sw", x: a.x, y: a.y + a.h },
    { id: "se", x: a.x + a.w, y: a.y + a.h },
  ];
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  if (a.type === "arrow") {
    return {
      ...a,
      from: { x: a.from.x + dx, y: a.from.y + dy },
      to: { x: a.to.x + dx, y: a.to.y + dy },
    };
  }
  return { ...a, x: a.x + dx, y: a.y + dy };
}

/** Moves one handle to `p`. Boxes are re-normalized, so dragging past a corner flips them. */
export function resize(a: Annotation, handle: HandleId, p: Point): Annotation {
  if (a.type === "arrow") {
    return handle === "from" ? { ...a, from: p } : handle === "to" ? { ...a, to: p } : a;
  }
  if (a.type === "text") return a;
  const opposite: Point = {
    x: handle === "nw" || handle === "sw" ? a.x + a.w : a.x,
    y: handle === "nw" || handle === "ne" ? a.y + a.h : a.y,
  };
  return {
    ...a,
    x: Math.min(p.x, opposite.x),
    y: Math.min(p.y, opposite.y),
    w: Math.abs(p.x - opposite.x),
    h: Math.abs(p.y - opposite.y),
  };
}
