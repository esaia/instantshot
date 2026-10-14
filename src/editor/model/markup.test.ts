import { describe, expect, it } from "vitest";
import { markupToAnnotations } from "./markup";

describe("markupToAnnotations", () => {
  it("scales shapes into source pixels", () => {
    const out = markupToAnnotations(
      [
        {
          id: "a",
          type: "arrow",
          color: "#f00",
          width: 4,
          from: { x: 1, y: 2 },
          to: { x: 3, y: 4 },
        },
        { id: "r", type: "rect", color: "#0f0", width: 3, x: 10, y: 20, w: 30, h: 40 },
      ],
      2,
    );
    expect(out).toEqual([
      { id: "a", type: "arrow", color: "#f00", width: 8, from: { x: 2, y: 4 }, to: { x: 6, y: 8 } },
      { id: "r", type: "rect", color: "#0f0", width: 6, x: 20, y: 40, w: 60, h: 80 },
    ]);
  });

  it("drops malformed entries", () => {
    expect(markupToAnnotations("nope", 2)).toEqual([]);
    expect(
      markupToAnnotations(
        [
          null,
          { id: "x", type: "blur", color: "#f00", width: 4, x: 0, y: 0, w: 1, h: 1 },
          { id: "y", type: "rect", color: "#f00", width: 4, x: "0", y: 0, w: 1, h: 1 },
          {
            id: "z",
            type: "arrow",
            color: "#f00",
            width: 0,
            from: { x: 0, y: 0 },
            to: { x: 1, y: 1 },
          },
        ],
        1,
      ),
    ).toEqual([]);
  });
});
