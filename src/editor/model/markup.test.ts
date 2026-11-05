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

  it("scales freehand strokes point by point", () => {
    const out = markupToAnnotations(
      [
        {
          id: "p",
          type: "pen",
          color: "#00f",
          width: 5,
          points: [
            { x: 1, y: 1 },
            { x: 4, y: 2 },
          ],
        },
      ],
      2,
    );
    expect(out).toEqual([
      {
        id: "p",
        type: "pen",
        color: "#00f",
        width: 10,
        points: [
          { x: 2, y: 2 },
          { x: 8, y: 4 },
        ],
      },
    ]);
    expect(
      markupToAnnotations([{ id: "q", type: "pen", color: "#00f", width: 5, points: [] }], 1),
    ).toEqual([]);
  });

  it("keeps redactions and text, scaling the font size", () => {
    const out = markupToAnnotations(
      [
        { id: "b", type: "blur", color: "#f00", width: 3, x: 1, y: 2, w: 3, h: 4 },
        { id: "p", type: "pixelate", color: "#f00", width: 3, x: 1, y: 2, w: 3, h: 4 },
        {
          id: "t",
          type: "text",
          color: "#fff",
          width: 3,
          x: 1,
          y: 2,
          w: 30,
          h: 20,
          text: "Hi",
          size: 16,
        },
        {
          id: "e",
          type: "text",
          color: "#fff",
          width: 3,
          x: 1,
          y: 2,
          w: 30,
          h: 20,
          text: "",
          size: 16,
        },
      ],
      2,
    );
    expect(out).toEqual([
      { id: "b", type: "blur", color: "#f00", width: 6, x: 2, y: 4, w: 6, h: 8 },
      { id: "p", type: "pixelate", color: "#f00", width: 6, x: 2, y: 4, w: 6, h: 8 },
      {
        id: "t",
        type: "text",
        color: "#fff",
        width: 6,
        x: 2,
        y: 4,
        w: 60,
        h: 40,
        text: "Hi",
        size: 32,
      },
    ]);
  });

  it("drops malformed entries", () => {
    expect(markupToAnnotations("nope", 2)).toEqual([]);
    expect(
      markupToAnnotations(
        [
          null,
          { id: "x", type: "star", color: "#f00", width: 4, x: 0, y: 0, w: 1, h: 1 },
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
