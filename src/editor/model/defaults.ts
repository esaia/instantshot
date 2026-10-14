import { GRADIENTS } from "../presets/gradients";
import { WALLPAPERS } from "../wallpapers/presets";
import type { AspectId, Background, ChromeId, Crop, EditorStyle } from "./types";

export const ASPECTS: { id: AspectId; label: string; name: string; ratio: number | null }[] = [
  { id: "auto", label: "Auto", name: "Fit", ratio: null },
  { id: "1:1", label: "1:1", name: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", name: "Classic", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", name: "Photo", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", name: "Wide", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", name: "Story", ratio: 9 / 16 },
  { id: "4:5", label: "4:5", name: "Portrait", ratio: 4 / 5 },
];

const CHROMES: ChromeId[] = ["none", "light", "dark"];

export const NO_CROP: Crop = { top: 0, bottom: 0, left: 0, right: 0 };
/** Most that can be trimmed from both opposite edges together, so something always remains. */
export const MAX_CROP = 0.9;

/** Each edge's crop, kept within [0, 1] and so opposite edges leave at least 10%. */
export function clampCrop(crop: Crop, edge: keyof Crop, value: number): Crop {
  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
  const room = MAX_CROP - crop[opposite[edge]];
  return { ...crop, [edge]: Math.min(Math.max(0, value), Math.max(0, room)) };
}

/** Slider ranges (logical px, opacity 0–1). */
export const LIMITS = {
  padding: [0, 200],
  inset: [0, 80],
  radius: [0, 40],
  shadow: [0, 100],
  shadowOpacity: [0, 1],
  backgroundBlur: [0, 40],
} as const satisfies Record<string, readonly [number, number]>;

export const DEFAULT_STYLE: EditorStyle = {
  background: { kind: "wallpaper", id: WALLPAPERS[0].id },
  padding: 64,
  inset: 0,
  radius: 12,
  shadow: 40,
  shadowOpacity: 0.35,
  backgroundBlur: 0,
  chrome: "none",
  aspect: "16:9",
  crop: NO_CROP,
};

/** Style fields each sidebar section's "Reset" restores. */
export const SECTIONS = {
  background: ["background", "backgroundBlur"],
  frame: ["padding", "inset", "radius", "shadow", "shadowOpacity"],
  chrome: ["chrome"],
  aspect: ["aspect"],
  crop: ["crop"],
} as const satisfies Record<string, readonly (keyof EditorStyle)[]>;
export type Section = keyof typeof SECTIONS;

export function resetSection(style: EditorStyle, section: Section): EditorStyle {
  const next: Record<string, unknown> = { ...style };
  for (const key of SECTIONS[section]) next[key] = DEFAULT_STYLE[key];
  return next as unknown as EditorStyle;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, [min, max]: readonly [number, number], fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

const HEX = /^#[0-9a-f]{6}$/i;

function parseBackground(v: unknown): Background {
  if (!isRecord(v)) return DEFAULT_STYLE.background;
  switch (v.kind) {
    case "wallpaper":
      return WALLPAPERS.some((w) => w.id === v.id)
        ? { kind: "wallpaper", id: v.id as string }
        : DEFAULT_STYLE.background;
    case "system":
      return typeof v.id === "string" ? { kind: "system", id: v.id } : DEFAULT_STYLE.background;
    case "solid":
      return typeof v.color === "string" && HEX.test(v.color)
        ? { kind: "solid", color: v.color }
        : DEFAULT_STYLE.background;
    case "gradient":
      return GRADIENTS.some((g) => g.id === v.id)
        ? { kind: "gradient", id: v.id as string }
        : DEFAULT_STYLE.background;
    case "none":
      return { kind: "none" };
    default:
      // "custom" images aren't persisted.
      return DEFAULT_STYLE.background;
  }
}

/** Validates a stored style, falling back to defaults field by field. */
export function parseStyle(value: unknown): EditorStyle {
  if (!isRecord(value)) return DEFAULT_STYLE;
  const d = DEFAULT_STYLE;
  return {
    background: parseBackground(value.background),
    padding: num(value.padding, LIMITS.padding, d.padding),
    inset: num(value.inset, LIMITS.inset, d.inset),
    radius: num(value.radius, LIMITS.radius, d.radius),
    shadow: num(value.shadow, LIMITS.shadow, d.shadow),
    shadowOpacity: num(value.shadowOpacity, LIMITS.shadowOpacity, d.shadowOpacity),
    backgroundBlur: num(value.backgroundBlur, LIMITS.backgroundBlur, d.backgroundBlur),
    chrome: CHROMES.includes(value.chrome as ChromeId) ? (value.chrome as ChromeId) : d.chrome,
    aspect: ASPECTS.some((a) => a.id === value.aspect) ? (value.aspect as AspectId) : d.aspect,
    crop: NO_CROP,
  };
}
