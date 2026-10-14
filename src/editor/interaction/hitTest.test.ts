import { describe, expect, it } from "vitest";
import type { Annotation } from "../model/types";
import { type Mapping, sourceToView, viewToSource } from "./coords";
import { resize, translate } from "./handles";
import { handleAt, hitTest, segmentDistance } from "./hitTest";

const base = { color: "#f00", width: 4 };
const arrow: Annotation = {
  ...base,
  id: "a",
  type: "arrow",
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
};
const rect: Annotation = { ...base, id: "r", type: "rect", x: 200, y: 200, w: 100, h: 100 };
const blur: Annotation = { ...base, id: "b", type: "blur", x: 200, y: 200, w: 50, h: 50 };

describe("hit testing", () => {
  it("measures distance to a segment", () => {
    expect(segmentDistance({ x: 50, y: 5 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(5);
    expect(segmentDistance({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(5);
  });

  it("hits arrows near the shaft", () => {
    expect(hitTest([arrow], { x: 50, y: 4 }, 3)?.id).toBe("a");
    expect(hitTest([arrow], { x: 50, y: 20 }, 3)).toBeNull();
  });

  it("hits rectangles on the outline only", () => {
    expect(hitTest([rect], { x: 201, y: 250 }, 3)?.id).toBe("r");
    expect(hitTest([rect], { x: 250, y: 250 }, 3)).toBeNull();
  });

  it("prefers the topmost annotation", () => {
    expect(hitTest([rect, blur], { x: 201, y: 210 }, 3)?.id).toBe("b");
    expect(hitTest([blur, rect], { x: 201, y: 210 }, 3)?.id).toBe("r");
  });

  it("finds handles", () => {
    expect(handleAt(rect, { x: 301, y: 299 }, 4)?.id).toBe("se");
    expect(handleAt(arrow, { x: 99, y: 1 }, 4)?.id).toBe("to");
  });
});

describe("editing", () => {
  it("moves and resizes", () => {
    expect(translate(rect, 5, -5)).toMatchObject({ x: 205, y: 195, w: 100, h: 100 });
    expect(resize(rect, "se", { x: 350, y: 260 })).toMatchObject({ x: 200, y: 200, w: 150, h: 60 });
    // Dragging past the opposite corner flips the box.
    expect(resize(rect, "se", { x: 150, y: 150 })).toMatchObject({ x: 150, y: 150, w: 50, h: 50 });
  });
});

describe("coords", () => {
  const m: Mapping = {
    layout: {
      width: 600,
      height: 400,
      frame: { x: 100, y: 50, w: 400, h: 300 },
      image: { x: 100, y: 50, w: 400, h: 300 },
      chromeHeight: 0,
    },
    crop: { x: 20, y: 10, w: 800, h: 600 },
    view: 0.5,
  };

  it("round-trips", () => {
    const p = { x: 123, y: 77 };
    const back = viewToSource(m, sourceToView(m, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("maps the image origin to the crop origin", () => {
    expect(viewToSource(m, { x: 50, y: 25 })).toEqual({ x: 20, y: 10 });
  });
});
