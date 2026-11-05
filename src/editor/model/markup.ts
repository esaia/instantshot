import type { Annotation, BoxAnnotation, Point } from "./types";

// Annotations drawn in the selection overlay arrive in logical px relative to the selection;
// the editor works in source pixels. The payload went through Rust as opaque JSON, so every
// field is checked before it reaches the document.

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";
const isPoint = (v: unknown): v is Point => {
  const p = v as Point | null;
  return typeof p === "object" && p !== null && num(p.x) && num(p.y);
};

type BoxType = BoxAnnotation["type"];
const BOX_TYPES: readonly string[] = ["rect", "ellipse", "blur", "pixelate"] satisfies BoxType[];

/** Valid overlay annotations, scaled by `scale` into source pixels. Invalid entries are dropped. */
export function markupToAnnotations(items: unknown, scale: number): Annotation[] {
  if (!Array.isArray(items)) return [];
  const s = num(scale) && scale > 0 ? scale : 1;
  const out: Annotation[] = [];
  for (const raw of items) {
    const a = raw as Record<string, unknown> | null;
    if (typeof a !== "object" || a === null) continue;
    if (!str(a.id) || !str(a.color) || !num(a.width) || a.width <= 0) continue;
    const base = { id: a.id, color: a.color, width: a.width * s };
    if (
      a.type === "pen" &&
      Array.isArray(a.points) &&
      a.points.length > 0 &&
      a.points.every(isPoint)
    ) {
      out.push({
        ...base,
        type: "pen",
        points: a.points.map((p: Point) => ({ x: p.x * s, y: p.y * s })),
      });
    } else if (a.type === "arrow" && isPoint(a.from) && isPoint(a.to)) {
      out.push({
        ...base,
        type: "arrow",
        from: { x: a.from.x * s, y: a.from.y * s },
        to: { x: a.to.x * s, y: a.to.y * s },
      });
    } else if (num(a.x) && num(a.y) && num(a.w) && num(a.h)) {
      const box = { x: a.x * s, y: a.y * s, w: a.w * s, h: a.h * s };
      if (BOX_TYPES.includes(a.type as BoxType)) {
        out.push({ ...base, ...box, type: a.type as BoxType });
      } else if (a.type === "text" && str(a.text) && a.text && num(a.size) && a.size > 0) {
        out.push({ ...base, ...box, type: "text", text: a.text, size: a.size * s });
      }
    }
  }
  return out;
}
