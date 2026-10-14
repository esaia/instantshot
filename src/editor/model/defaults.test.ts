import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, parseStyle, resetSection } from "./defaults";

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
