// Raw image wire format shared with Rust (`editor::encode_raw`): u32 width, u32 height, f32 scale
// (little-endian), then width*height RGBA bytes.

import { makeCanvas } from "../render/canvas";

export interface RawFrame {
  width: number;
  height: number;
  scale: number;
  pixels: Uint8ClampedArray;
}

const HEADER = 12;

export function decodeRawFrame(buffer: ArrayBuffer): RawFrame {
  if (buffer.byteLength < HEADER) throw new Error("image data is truncated");
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const scale = view.getFloat32(8, true);
  const length = width * height * 4;
  if (width === 0 || height === 0 || buffer.byteLength < HEADER + length) {
    throw new Error("image data is truncated");
  }
  return {
    width,
    height,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    pixels: new Uint8ClampedArray(buffer, HEADER, length),
  };
}

export function encodeRawFrame(frame: RawFrame): ArrayBuffer {
  const out = new ArrayBuffer(HEADER + frame.pixels.length);
  const view = new DataView(out);
  view.setUint32(0, frame.width, true);
  view.setUint32(4, frame.height, true);
  view.setFloat32(8, frame.scale, true);
  new Uint8ClampedArray(out, HEADER).set(frame.pixels);
  return out;
}

export function toCanvas(frame: RawFrame): HTMLCanvasElement {
  const canvas = makeCanvas(frame.width, frame.height);
  // biome-ignore lint/style/noNonNullAssertion: 2d contexts are always available on a new canvas
  const ctx = canvas.getContext("2d")!;
  // Copy: the frame may view a larger buffer, which ImageData doesn't accept.
  ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width), 0, 0);
  return canvas;
}

/** `[u32 LE thumbnail length][thumbnail PNG][full PNG]`, parsed by `export::parse_drag_body`. */
export function dragPayload(thumb: Uint8Array, full: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + thumb.length + full.length);
  new DataView(out.buffer).setUint32(0, thumb.length, true);
  out.set(thumb, 4);
  out.set(full, 4 + thumb.length);
  return out;
}
