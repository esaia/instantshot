import type { Annotation, Box, Point } from "../model/types";
import {
  boxCenter,
  constrainRatio,
  rotatedCorners,
  rotatePoint,
  snapAngle,
} from "../render/geometry";

export type HandleId = "from" | "to" | "nw" | "ne" | "sw" | "se" | "rotate";

/** Shift-rotation step. */
const ROTATE_STEP = Math.PI / 12;

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

/** Smallest font size a text can be scaled down to, source px. */
const MIN_TEXT_SIZE = 6;
/** How far text may be stretched or squeezed horizontally. */
const MAX_STRETCH = 6;

/**
 * Handles of a selected annotation: arrow ends, or the (rotated) corners of a box plus, when
 * `rotateOffset` (source px) is given, a rotation handle that far above the top edge.
 * Text corners scale the font.
 */
export function handlesFor(a: Annotation, rotateOffset = 0): Handle[] {
  if (a.type === "arrow") {
    return [
      { id: "from", ...a.from },
      { id: "to", ...a.to },
    ];
  }
  const angle = a.rotation ?? 0;
  const [nw, ne, se, sw] = rotatedCorners(a, angle);
  const handles: Handle[] = [
    { id: "nw", ...nw },
    { id: "ne", ...ne },
    { id: "sw", ...sw },
    { id: "se", ...se },
  ];
  if (rotateOffset > 0) {
    const top = { x: a.x + a.w / 2, y: a.y - rotateOffset };
    handles.push({ id: "rotate", ...rotatePoint(top, boxCenter(a), angle) });
  }
  return handles;
}

/** Rotation that points the rotate handle at `p`; `snap` (Shift) rounds to 15° steps. */
export function rotateTo(a: Annotation, p: Point, snap = false): Annotation {
  if (a.type === "arrow") return a;
  const c = boxCenter(a);
  let angle = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2;
  if (snap) angle = Math.round(angle / ROTATE_STEP) * ROTATE_STEP;
  // Normalized to (-π, π] so stored values stay small.
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  return { ...a, rotation: Math.abs(angle) < 1e-9 ? 0 : angle };
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

/**
 * Moves one handle to `p`. Boxes are re-normalized, so dragging past a corner flips them.
 * Text stretches freely (font size follows the height, the width stretches the glyphs).
 * `constrain` (Shift) keeps the original proportions, or snaps arrows to 45°.
 */
export function resize(a: Annotation, handle: HandleId, p: Point, constrain = false): Annotation {
  if (a.type === "arrow") {
    if (handle !== "from" && handle !== "to") return a;
    const fixed = handle === "from" ? a.to : a.from;
    const q = constrain ? snapAngle(fixed, p) : p;
    return handle === "from" ? { ...a, from: q } : { ...a, to: q };
  }
  if (handle === "rotate") return rotateTo(a, p, constrain);
  const angle = a.rotation ?? 0;
  if (!angle) return resizeLocal(a, handle, p, constrain);
  // Resize in the shape's own (unrotated) frame, then move it so the corner opposite the
  // handle stays where it was on screen.
  const c = boxCenter(a);
  const local = resizeLocal(a, handle, rotatePoint(p, c, -angle), constrain);
  if (local.type === "arrow") return local;
  const center = rotatePoint(boxCenter(local), c, angle);
  return { ...local, x: center.x - local.w / 2, y: center.y - local.h / 2 };
}

/** [`resize`] for an unrotated box. */
function resizeLocal(a: Annotation, handle: HandleId, p: Point, constrain: boolean): Annotation {
  if (a.type === "arrow") return a;
  const opposite: Point = {
    x: handle === "nw" || handle === "sw" ? a.x + a.w : a.x,
    y: handle === "nw" || handle === "ne" ? a.y + a.h : a.y,
  };
  if (a.type === "text") {
    // Anchored at the opposite corner; text never flips.
    const sx = a.scaleX ?? 1;
    const f = Math.max(
      constrain
        ? Math.max(Math.abs(p.x - opposite.x) / (a.w || 1), Math.abs(p.y - opposite.y) / (a.h || 1))
        : Math.abs(p.y - opposite.y) / (a.h || 1),
      MIN_TEXT_SIZE / a.size,
    );
    const h = a.h * f;
    // Unstretched width at the new size.
    const natural = (a.w / sx) * f;
    const scaleX = constrain
      ? sx
      : Math.min(MAX_STRETCH, Math.max(1 / MAX_STRETCH, Math.abs(p.x - opposite.x) / natural));
    const w = natural * scaleX;
    return {
      ...a,
      size: a.size * f,
      scaleX,
      w,
      h,
      x: opposite.x === a.x ? a.x : opposite.x - w,
      y: opposite.y === a.y ? a.y : opposite.y - h,
    };
  }
  const q = constrain ? constrainRatio(opposite, p, a.w / (a.h || 1)) : p;
  return {
    ...a,
    x: Math.min(q.x, opposite.x),
    y: Math.min(q.y, opposite.y),
    w: Math.abs(q.x - opposite.x),
    h: Math.abs(q.y - opposite.y),
  };
}
