import type { Box, Point } from "../model/types";
import type { Layout } from "../render/layout";

/**
 * Maps between view coordinates (CSS px inside the preview canvas) and source-image pixels.
 * `view` is the preview's CSS px per logical px.
 */
export interface Mapping {
  layout: Layout;
  crop: Box;
  view: number;
}

/** Source px per logical px of the composition. */
const k = (m: Mapping) => m.crop.w / m.layout.image.w;

export function viewToSource(m: Mapping, p: Point): Point {
  const lx = p.x / m.view;
  const ly = p.y / m.view;
  return {
    x: (lx - m.layout.image.x) * k(m) + m.crop.x,
    y: (ly - m.layout.image.y) * k(m) + m.crop.y,
  };
}

export function sourceToView(m: Mapping, p: Point): Point {
  return {
    x: ((p.x - m.crop.x) / k(m) + m.layout.image.x) * m.view,
    y: ((p.y - m.crop.y) / k(m) + m.layout.image.y) * m.view,
  };
}

/** Source px covered by one view px (for tolerances and handle sizes). */
export function sourcePerViewPx(m: Mapping): number {
  return k(m) / m.view;
}
