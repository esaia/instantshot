import { describe, expect, it } from "vitest";
import { boxBlur3 } from "./blur";

describe("boxBlur3", () => {
  it("keeps flat images flat", () => {
    const px = new Uint8ClampedArray(8 * 8 * 4).fill(120);
    boxBlur3(px, 8, 8, 6);
    expect(px.every((v) => v === 120)).toBe(true);
  });

  it("spreads a bright pixel symmetrically and keeps energy", () => {
    const w = 21;
    const px = new Uint8ClampedArray(w * w * 4);
    const center = (10 * w + 10) * 4;
    px[center] = 255;
    boxBlur3(px, w, w, 5);
    const red = (x: number, y: number) => px[(y * w + x) * 4];
    expect(red(10, 10)).toBeLessThan(255);
    expect(red(9, 10)).toBe(red(11, 10));
    expect(red(10, 9)).toBe(red(10, 11));
    expect(red(10, 10)).toBeGreaterThanOrEqual(red(12, 10));
  });

  it("ignores tiny radii", () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const copy = [...px];
    boxBlur3(px, 2, 2, 0.5);
    expect([...px]).toEqual(copy);
  });
});
