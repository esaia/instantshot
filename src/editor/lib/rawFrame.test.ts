import { describe, expect, it } from "vitest";
import { screenshotFileName } from "./fileName";
import { decodeRawFrame, dragPayload, encodeRawFrame } from "./rawFrame";

describe("raw frames", () => {
  it("round-trips", () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    const frame = decodeRawFrame(encodeRawFrame({ width: 2, height: 1, scale: 2, pixels }));
    expect(frame.width).toBe(2);
    expect(frame.scale).toBe(2);
    expect([...frame.pixels]).toEqual([...pixels]);
  });

  it("rejects truncated data", () => {
    const buf = encodeRawFrame({
      width: 2,
      height: 2,
      scale: 1,
      pixels: new Uint8ClampedArray(16),
    });
    expect(() => decodeRawFrame(buf.slice(0, 20))).toThrow();
    expect(() => decodeRawFrame(new ArrayBuffer(4))).toThrow();
  });

  it("frames drag payloads", () => {
    const p = dragPayload(new Uint8Array([7, 8]), new Uint8Array([9]));
    expect([...p]).toEqual([2, 0, 0, 0, 7, 8, 9]);
  });
});

describe("file names", () => {
  it("formats like macOS screenshots", () => {
    expect(screenshotFileName(new Date(2026, 9, 4, 9, 5, 7))).toBe(
      "TextPicker 2026-10-04 at 09.05.07.png",
    );
  });
});
