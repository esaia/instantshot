import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "../model/defaults";
import type { EditorStyle } from "../model/types";
import { CHROME_HEIGHT, computeLayout, outputSize } from "./layout";

const style = (patch: Partial<EditorStyle>): EditorStyle => ({
  ...DEFAULT_STYLE,
  padding: 0,
  inset: 0,
  aspect: "auto",
  ...patch,
});

describe("computeLayout", () => {
  it("wraps the image in padding, inset and chrome", () => {
    const l = computeLayout(400, 300, style({ padding: 50, inset: 10, chrome: "light" }));
    expect(l.width).toBe(400 + 20 + 100);
    expect(l.height).toBe(300 + 20 + CHROME_HEIGHT + 100);
    expect(l.frame).toEqual({ x: 50, y: 50, w: 420, h: 320 + CHROME_HEIGHT });
    expect(l.image).toEqual({ x: 60, y: 50 + CHROME_HEIGHT + 10, w: 400, h: 300 });
  });

  it("grows the short side for an aspect ratio and centers the frame", () => {
    const wide = computeLayout(400, 300, style({ aspect: "16:9" }));
    expect(wide.height).toBe(300);
    expect(wide.width).toBeCloseTo(300 * (16 / 9));
    expect(wide.frame.x).toBeCloseTo((wide.width - 400) / 2);

    const tall = computeLayout(400, 300, style({ aspect: "9:16" }));
    expect(tall.width).toBe(400);
    expect(tall.height).toBeCloseTo(400 * (16 / 9));
    expect(tall.frame.y).toBeCloseTo((tall.height - 300) / 2);
  });

  it("never crops for an aspect ratio", () => {
    for (const aspect of ["1:1", "4:3", "3:2", "16:9", "9:16", "4:5"] as const) {
      const l = computeLayout(640, 200, style({ aspect, padding: 20 }));
      expect(l.width).toBeGreaterThanOrEqual(680 - 1e-9);
      expect(l.height).toBeGreaterThanOrEqual(240 - 1e-9);
    }
  });
});

describe("outputSize", () => {
  it("renders at the capture scale", () => {
    const l = computeLayout(400, 300, style({}));
    expect(outputSize(l, 2)).toEqual({ width: 800, height: 600, scale: 2 });
  });

  it("shrinks huge outputs", () => {
    const l = computeLayout(10000, 5000, style({}));
    const o = outputSize(l, 2);
    expect(o.width).toBeLessThanOrEqual(16384);
    expect(o.width * o.height).toBeLessThanOrEqual(100_000_000 * 1.001);
  });
});
