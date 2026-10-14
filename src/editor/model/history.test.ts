import { describe, expect, it } from "vitest";
import { apply, createHistory, HISTORY_LIMIT, redo, seal, undo } from "./history";

describe("history", () => {
  it("undoes and redoes", () => {
    let h = createHistory(0);
    h = apply(h, 1);
    h = apply(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = undo(undo(h));
    expect(h.present).toBe(0);
    expect(undo(h).present).toBe(0);
  });

  it("coalesces changes with the same key until sealed", () => {
    let h = createHistory(0);
    h = apply(h, 1, "padding");
    h = apply(h, 2, "padding");
    h = apply(h, 3, "padding");
    expect(h.past).toEqual([0]);
    h = seal(h);
    h = apply(h, 4, "padding");
    expect(h.past).toEqual([0, 3]);
    h = apply(h, 5, "radius");
    expect(h.past).toEqual([0, 3, 4]);
  });

  it("clears redo after a new change", () => {
    let h = apply(apply(createHistory(0), 1), 2);
    h = undo(h);
    h = apply(h, 9);
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe(9);
  });

  it("caps the number of steps", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = apply(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });

  it("ignores identical changes", () => {
    const h = createHistory(1);
    expect(apply(h, 1)).toBe(h);
  });
});
