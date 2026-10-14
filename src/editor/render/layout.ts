import { ASPECTS } from "../model/defaults";
import type { Box, EditorStyle } from "../model/types";

/** Height of the optional window title bar, logical px. */
export const CHROME_HEIGHT = 28;

export interface Layout {
  /** Composition size, logical px. */
  width: number;
  height: number;
  /** The framed window: chrome + inset + image. */
  frame: Box;
  /** Where the (cropped) screenshot is drawn. */
  image: Box;
  chromeHeight: number;
}

/**
 * Lays out the composition for a screenshot of `imgW`×`imgH` logical px. An aspect preset only
 * ever grows the canvas (never crops), keeping the frame centered.
 */
export function computeLayout(imgW: number, imgH: number, style: EditorStyle): Layout {
  const chromeHeight = style.chrome === "none" ? 0 : CHROME_HEIGHT;
  const frameW = imgW + style.inset * 2;
  const frameH = imgH + style.inset * 2 + chromeHeight;
  let width = frameW + style.padding * 2;
  let height = frameH + style.padding * 2;

  const ratio = ASPECTS.find((a) => a.id === style.aspect)?.ratio ?? null;
  if (ratio !== null) {
    if (width / height < ratio) width = height * ratio;
    else height = width / ratio;
  }

  const frame = { x: (width - frameW) / 2, y: (height - frameH) / 2, w: frameW, h: frameH };
  return {
    width,
    height,
    frame,
    image: { x: frame.x + style.inset, y: frame.y + chromeHeight + style.inset, w: imgW, h: imgH },
    chromeHeight,
  };
}

/** Output size in pixels at `scale`, shrinking the scale if the result would be too large. */
export function outputSize(
  layout: Layout,
  scale: number,
  maxSide = 16384,
  maxArea = 100_000_000,
): { width: number; height: number; scale: number } {
  let s = scale;
  s = Math.min(s, maxSide / layout.width, maxSide / layout.height);
  s = Math.min(s, Math.sqrt(maxArea / (layout.width * layout.height)));
  return {
    width: Math.max(1, Math.round(layout.width * s)),
    height: Math.max(1, Math.round(layout.height * s)),
    scale: s,
  };
}
