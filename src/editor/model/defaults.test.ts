import { describe, expect, it } from "vitest";
import { sourceCrop } from "../render/compose";
import { clampCrop, DEFAULT_STYLE, NO_CROP, parseStyle, resetSection } from "./defaults";
import type { SourceImage } from "./types";

describe("parseStyle", () => {
  it("falls back to defaults for garbage", () => {
    expect(parseStyle(null)).toEqual(DEFAULT_STYLE);
    expect(parseStyle("x")).toEqual(DEFAULT_STYLE);
    expect(parseStyle({ padding: "big", aspect: "7:3", chrome: 1 })).toEqual(DEFAULT_STYLE);
  });

  it("keeps valid values and clamps numbers", () => {
    const s = parseStyle({
      padding: 9999,
      radius: 8,
      background: { kind: "solid", color: "#112233" },
      aspect: "16:9",
      chrome: "dark",
      backgroundBlur: 99,
    });
    expect(s.padding).toBe(200);
    expect(s.radius).toBe(8);
    expect(s.background).toEqual({ kind: "solid", color: "#112233" });
    expect(s.aspect).toBe("16:9");
    expect(s.chrome).toBe("dark");
    expect(s.backgroundBlur).toBe(40);
  });

  it("drops session-only and unknown backgrounds", () => {
    expect(parseStyle({ background: { kind: "custom" } }).background).toEqual(
      DEFAULT_STYLE.background,
    );
    expect(parseStyle({ background: { kind: "gradient", id: "nope" } }).background).toEqual(
      DEFAULT_STYLE.background,
    );
    expect(parseStyle({ background: { kind: "solid", color: "red;}" } }).background).toEqual(
      DEFAULT_STYLE.background,
    );
  });
});

describe("resetSection", () => {
  it("resets only that section", () => {
    const s = { ...DEFAULT_STYLE, padding: 5, shadow: 0, chrome: "dark" as const };
    const r = resetSection(s, "frame");
    expect(r.padding).toBe(DEFAULT_STYLE.padding);
    expect(r.shadow).toBe(DEFAULT_STYLE.shadow);
    expect(r.chrome).toBe("dark");
  });
});

describe("crop", () => {
  it("keeps opposite edges from meeting", () => {
    const c = clampCrop({ ...NO_CROP, top: 0.6 }, "bottom", 0.5);
    expect(c.bottom).toBeCloseTo(0.3);
    expect(clampCrop(NO_CROP, "left", -1).left).toBe(0);
  });

  it("is never restored from storage", () => {
    expect(
      parseStyle({ ...DEFAULT_STYLE, crop: { top: 0.2, bottom: 0, left: 0, right: 0 } }).crop,
    ).toEqual(NO_CROP);
  });

  it("trims the source region", () => {
    const source = { width: 200, height: 100, scale: 2 } as SourceImage;
    expect(sourceCrop(source, { top: 0.1, bottom: 0.2, left: 0.25, right: 0 })).toEqual({
      x: 50,
      y: 10,
      w: 150,
      h: 70,
    });
  });
});
