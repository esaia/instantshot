import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE } from "./defaults";
import { editorReducer, initialEditorState } from "./editorReducer";
import type { Annotation } from "./types";

const rect: Annotation = {
  id: "r1",
  type: "rect",
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  color: "#f00",
  width: 4,
};
const text: Annotation = {
  id: "t1",
  type: "text",
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  text: "hi",
  size: 20,
  color: "#f00",
  width: 4,
};

describe("editorReducer", () => {
  it("selects added annotations and clears selection on undo", () => {
    let s = initialEditorState(DEFAULT_STYLE);
    s = editorReducer(s, { type: "add", annotation: rect });
    expect(s.selectedId).toBe("r1");
    s = editorReducer(s, { type: "undo" });
    expect(s.history.present.annotations).toEqual([]);
    expect(s.selectedId).toBeNull();
  });

  it("recolors the selected annotation", () => {
    let s = editorReducer(initialEditorState(DEFAULT_STYLE), { type: "add", annotation: rect });
    s = editorReducer(s, { type: "color", color: "#00f" });
    expect(s.history.present.annotations[0].color).toBe("#00f");
    expect(s.color).toBe("#00f");
  });

  it("rescales text bounds with the font size", () => {
    let s = editorReducer(initialEditorState(DEFAULT_STYLE), { type: "add", annotation: text });
    s = editorReducer(s, { type: "strokeWidth", width: 8, scale: 1 });
    const t = s.history.present.annotations[0];
    expect(t.type === "text" && [t.size, t.w, t.h]).toEqual([32, 160, 32]);
  });

  it("coalesces moves into one undo step", () => {
    let s = editorReducer(initialEditorState(DEFAULT_STYLE), { type: "add", annotation: rect });
    for (let x = 1; x <= 5; x++) {
      s = editorReducer(s, { type: "update", annotation: { ...rect, x }, key: "move:r1" });
    }
    s = editorReducer(s, { type: "seal" });
    s = editorReducer(s, { type: "undo" });
    expect(s.history.present.annotations[0]).toEqual(rect);
  });
});
