import { describe, expect, it } from "vitest";
import { meshSpec, mulberry32 } from "./mesh";
import { WALLPAPERS } from "./presets";

describe("mesh wallpapers", () => {
  it("is deterministic", () => {
    expect(meshSpec(WALLPAPERS[0])).toEqual(meshSpec(WALLPAPERS[0]));
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect([a(), a()]).toEqual([b(), b()]);
  });

  it("uses every palette color with sane geometry", () => {
    for (const w of WALLPAPERS) {
      const blobs = meshSpec(w);
      for (const c of w.palette) expect(blobs.some((b) => b.color === c)).toBe(true);
      for (const b of blobs) {
        expect(b.r).toBeGreaterThan(0.3);
        expect(b.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it("has unique ids and seeds", () => {
    expect(new Set(WALLPAPERS.map((w) => w.id)).size).toBe(WALLPAPERS.length);
    expect(new Set(WALLPAPERS.map((w) => w.seed)).size).toBe(WALLPAPERS.length);
  });
});
