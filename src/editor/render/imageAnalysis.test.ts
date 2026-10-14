import { describe, expect, it } from "vitest";
import { edgeColor } from "./imageAnalysis";

/** A `w`×`h` white image with a black block at `box`. */
function image(w: number, h: number, box: { x: number; y: number; w: number; h: number }) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return px;
}

describe("image analysis", () => {
  it("finds the border color", () => {
    expect(edgeColor(image(20, 10, { x: 5, y: 3, w: 4, h: 4 }), 20, 10)).toBe("#ffffff");
  });
});
