import { describe, expect, it } from "vitest";
import type { Annotation } from "../model/types";
import { handlesFor, resize } from "./handles";

const text: Annotation = {
  id: "t",
  type: "text",
  text: "hi",
  x: 100,
  y: 50,
  w: 40,
  h: 20,
  size: 16,
  color: "#fff",
  width: 4,
};

describe("text resize", () => {
  it("has corner handles", () => {
    expect(handlesFor(text).map((h) => h.id)).toEqual(["nw", "ne", "sw", "se"]);
  });

  it("stretches freely: height sets the font size, width stretches the glyphs", () => {
    const out = resize(text, "se", { x: 180, y: 70 });
    expect(out).toMatchObject({ x: 100, y: 50, w: 80, h: 20, size: 16, scaleX: 2 });
  });

  it("scales proportionally with Shift", () => {
    const out = resize(text, "se", { x: 180, y: 70 }, true);
    expect(out).toMatchObject({ x: 100, y: 50, w: 80, h: 40, size: 32, scaleX: 1 });
  });

  it("keeps the bottom-right fixed when dragging the top-left", () => {
    const out = resize(text, "nw", { x: 120, y: 60 }, true);
    expect(out).toMatchObject({ x: 120, y: 60, w: 20, h: 10, size: 8 });
  });

  it("never shrinks below the minimum size", () => {
    const out = resize(text, "se", { x: 100, y: 50 });
    expect(out.type === "text" && out.size).toBe(6);
  });
});

describe("constrained resize", () => {
  const box: Annotation = {
    id: "b",
    type: "rect",
    x: 0,
    y: 0,
    w: 40,
    h: 20,
    color: "#f00",
    width: 2,
  };

  it("keeps a box's proportions with Shift", () => {
    expect(resize(box, "se", { x: 100, y: 30 }, true)).toMatchObject({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("snaps arrows to 45°", () => {
    const arrow: Annotation = {
      id: "a",
      type: "arrow",
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
      color: "#f00",
      width: 2,
    };
    const out = resize(arrow, "to", { x: 10, y: 9 }, true);
    expect(out.type === "arrow" && Math.round(out.to.x - out.to.y)).toBe(0);
  });
});

describe("rotation", () => {
  const box: Annotation = {
    id: "b",
    type: "rect",
    x: 0,
    y: 0,
    w: 40,
    h: 20,
    color: "#f00",
    width: 2,
  };

  it("offers a rotate handle above the top edge", () => {
    const rot = handlesFor(box, 10).find((h) => h.id === "rotate");
    expect(rot).toMatchObject({ x: 20, y: -10 });
  });

  it("points the rotate handle at the pointer, snapping with Shift", () => {
    const right = resize(box, "rotate", { x: 100, y: 10 });
    expect("rotation" in right && right.rotation).toBeCloseTo(Math.PI / 2);
    const snapped = resize(box, "rotate", { x: 21, y: -100 }, true);
    expect("rotation" in snapped && snapped.rotation).toBe(0);
  });

  it("keeps the opposite corner in place when resizing a rotated box", () => {
    const rotated = { ...box, rotation: Math.PI / 6 };
    const before = handlesFor(rotated).find((h) => h.id === "nw");
    const se = handlesFor(rotated).find((h) => h.id === "se");
    if (!before || !se) throw new Error("missing handles");
    const out = resize(rotated, "se", { x: se.x + 15, y: se.y + 8 });
    const after = handlesFor(out).find((h) => h.id === "nw");
    expect(after?.x).toBeCloseTo(before.x);
    expect(after?.y).toBeCloseTo(before.y);
  });
});
