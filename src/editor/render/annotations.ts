import type { Annotation } from "../model/types";
import { context2d, makeCanvas } from "./canvas";
import { arrowHead } from "./geometry";

export const TEXT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
export const LINE_HEIGHT = 1.25;

export const font = (size: number) => `600 ${size}px ${TEXT_FONT}`;

let measurer: CanvasRenderingContext2D | null = null;

/** Bounds of multi-line text at `size` source px. */
export function measureText(text: string, size: number): { w: number; h: number } {
  measurer ??= context2d(makeCanvas(1, 1));
  measurer.font = font(size);
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => measurer?.measureText(l).width ?? 0), size * 0.5);
  return { w: Math.ceil(w), h: Math.ceil(lines.length * size * LINE_HEIGHT) };
}

/** Draws a stroke/text annotation in source-px coordinates (redactions are drawn elsewhere). */
export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation): void {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (a.type) {
    case "arrow": {
      const head = arrowHead(a.from, a.to, a.width);
      ctx.beginPath();
      ctx.moveTo(a.from.x, a.from.y);
      ctx.lineTo(head.base.x, head.base.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(head.tip.x, head.tip.y);
      ctx.lineTo(head.left.x, head.left.y);
      ctx.lineTo(head.right.x, head.right.y);
      ctx.closePath();
      ctx.lineWidth = a.width * 0.6;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "rect":
      ctx.beginPath();
      ctx.roundRect(a.x, a.y, a.w, a.h, Math.min(a.width * 1.5, a.w / 2, a.h / 2));
      ctx.stroke();
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "text": {
      ctx.font = font(a.size);
      ctx.textBaseline = "top";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, a.x, a.y + i * a.size * LINE_HEIGHT + a.size * 0.1);
      });
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
