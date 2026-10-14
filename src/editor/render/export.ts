import type { Doc } from "../model/types";
import { canvasToPng, context2d, makeCanvas } from "./canvas";
import { layoutFor, type RenderAssets, renderComposition } from "./compose";
import { outputSize } from "./layout";

/** Size of the drag-out preview image, px (macOS shows it at this size under the cursor). */
const DRAG_THUMB = 220;

function render(doc: Doc, assets: RenderAssets, scale: number): HTMLCanvasElement {
  const { layout } = layoutFor(assets.source, doc.style);
  const size = outputSize(layout, scale);
  const canvas = makeCanvas(size.width, size.height);
  renderComposition(context2d(canvas), doc, assets, { scale: size.scale });
  return canvas;
}

/** The final PNG at the capture's native resolution. */
export function exportPng(doc: Doc, assets: RenderAssets): Promise<Uint8Array> {
  return canvasToPng(render(doc, assets, assets.source.scale));
}

/** A small PNG used as the drag image. */
export function exportThumbnail(doc: Doc, assets: RenderAssets): Promise<Uint8Array> {
  const { layout } = layoutFor(assets.source, doc.style);
  const scale = DRAG_THUMB / Math.max(layout.width, layout.height);
  return canvasToPng(render(doc, assets, scale));
}
