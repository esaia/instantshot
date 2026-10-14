import { describe, expect, it } from "vitest";
import { arrowHead, boxFrom, coverFit, gradientLine, intersect } from "./geometry";

describe("geometry", () => {
  it("cover-fits by cropping the overflowing axis", () => {
    expect(coverFit(200, 100, 100, 100)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(coverFit(100, 200, 100, 100)).toEqual({ x: 0, y: 50, w: 100, h: 100 });
  });

  it("follows CSS gradient angles", () => {
    const toRight = gradientLine(90, 200, 100);
    expect(toRight.x0).toBeCloseTo(0);
    expect(toRight.x1).toBeCloseTo(200);
    expect(toRight.y0).toBeCloseTo(50);
    const down = gradientLine(180, 200, 100);
    expect(down.y0).toBeCloseTo(0);
    expect(down.y1).toBeCloseTo(100);
  });

  it("places the arrow head at the tip", () => {
    const h = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(h.tip).toEqual({ x: 100, y: 0 });
    expect(h.base.x).toBeCloseTo(84);
    expect(h.left.y).toBeCloseTo(-h.right.y);
  });

  it("normalizes and intersects boxes", () => {
    expect(boxFrom({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 5 });
    expect(intersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toEqual({
      x: 5,
      y: 5,
      w: 5,
      h: 5,
    });
    expect(intersect({ x: 0, y: 0, w: 1, h: 1 }, { x: 2, y: 2, w: 1, h: 1 })).toBeNull();
  });
});
