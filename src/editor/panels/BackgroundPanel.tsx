import { useEffect, useRef, useState } from "react";
import type { SystemWallpaper } from "../../lib/types";
import { LIMITS } from "../model/defaults";
import type { Background } from "../model/types";
import { COLORS } from "../presets/colors";
import { GRADIENTS, type GradientPreset } from "../presets/gradients";
import { generatedThumb, systemThumb } from "../wallpapers/cache";
import { WALLPAPERS } from "../wallpapers/presets";
import { CHECKERBOARD, PanelSection, Segmented, Slider, Swatch } from "./controls";

type Tab = "wallpaper" | "color" | "gradient";

const tabFor = (bg: Background): Tab =>
  bg.kind === "solid" || bg.kind === "none"
    ? "color"
    : bg.kind === "gradient"
      ? "gradient"
      : "wallpaper";

export const gradientCss = (g: GradientPreset) =>
  `linear-gradient(${g.angle}deg, ${g.stops.join(", ")})`;

export function BackgroundPanel({
  background,
  systemWallpapers,
  customPreview,
  onChange,
  onUpload,
  onReset,
  blur,
  onBlur,
  onBlurCommit,
}: {
  blur: number;
  onBlur: (value: number) => void;
  onBlurCommit: () => void;
  background: Background;
  systemWallpapers: SystemWallpaper[];
  /** Object URL of the uploaded image, if any. */
  customPreview: string | null;
  onChange: (bg: Background, key?: string) => void;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<Tab>(() => tabFor(background));
  const fileInput = useRef<HTMLInputElement>(null);
  const isSel = (kind: Background["kind"], id?: string) =>
    background.kind === kind && (id === undefined || ("id" in background && background.id === id));

  return (
    <PanelSection title="Background" onReset={onReset}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "wallpaper", label: "Wallpaper" },
          { id: "color", label: "Color" },
          { id: "gradient", label: "Gradient" },
        ]}
      />

      {tab === "wallpaper" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-[13px] font-medium text-white shadow-sm hover:bg-blue-600 active:bg-blue-700"
          >
            <UploadIcon />
            Upload Custom
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-4 gap-2">
            {customPreview && (
              <Swatch
                title="Custom image"
                selected={isSel("custom")}
                onClick={() => onChange({ kind: "custom" })}
                style={{ backgroundImage: `url(${customPreview})` }}
              />
            )}
            {WALLPAPERS.map((w) => (
              <ThumbSwatch
                key={w.id}
                title={w.name}
                selected={isSel("wallpaper", w.id)}
                load={() => generatedThumb(w.id)}
                onClick={() => onChange({ kind: "wallpaper", id: w.id })}
              />
            ))}
          </div>
          {systemWallpapers.length > 0 && (
            <>
              <h3 className="pt-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Your Desktop Pictures
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {systemWallpapers.map((w) => (
                  <ThumbSwatch
                    key={w.id}
                    title={w.name}
                    selected={isSel("system", w.id)}
                    load={() => systemThumb(w.id)}
                    onClick={() => onChange({ kind: "system", id: w.id })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "color" && (
        <div className="grid grid-cols-8 gap-1.5">
          <Swatch
            title="Transparent"
            selected={isSel("none")}
            onClick={() => onChange({ kind: "none" })}
            style={CHECKERBOARD}
          />
          {COLORS.map((c) => (
            <Swatch
              key={c}
              title={c}
              selected={background.kind === "solid" && background.color.toLowerCase() === c}
              onClick={() => onChange({ kind: "solid", color: c })}
              style={{ backgroundColor: c }}
            />
          ))}
          <ColorPicker
            value={background.kind === "solid" ? background.color : "#888888"}
            selected={
              background.kind === "solid" && !COLORS.includes(background.color.toLowerCase())
            }
            onChange={(color) => onChange({ kind: "solid", color }, "bg-pick")}
          />
        </div>
      )}

      {tab === "gradient" && (
        <div className="grid grid-cols-6 gap-2">
          {GRADIENTS.map((g) => (
            <Swatch
              key={g.id}
              title={g.id}
              selected={isSel("gradient", g.id)}
              onClick={() => onChange({ kind: "gradient", id: g.id })}
              style={{ backgroundImage: gradientCss(g) }}
            />
          ))}
        </div>
      )}
      {background.kind !== "none" && background.kind !== "solid" && (
        <Slider
          label="Blur"
          value={blur}
          min={LIMITS.backgroundBlur[0]}
          max={LIMITS.backgroundBlur[1]}
          onChange={onBlur}
          onCommit={onBlurCommit}
        />
      )}
    </PanelSection>
  );
}

function ThumbSwatch({
  title,
  selected,
  load,
  onClick,
}: {
  title: string;
  selected: boolean;
  load: () => Promise<string | null>;
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each tile loads its image once
  useEffect(() => {
    let alive = true;
    void load().then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Swatch
      title={title}
      selected={selected}
      onClick={onClick}
      style={
        url ? { backgroundImage: `url(${url})` } : { backgroundColor: "rgba(127,127,127,0.2)" }
      }
    />
  );
}

function ColorPicker({
  value,
  selected,
  onChange,
}: {
  value: string;
  selected: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <label
      title="Pick a color"
      className={`relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-[10px] text-[8px] font-bold tracking-wide text-white ring-1 ring-black/10 dark:ring-white/10 ${
        selected ? "outline-2 outline-offset-2 outline-blue-500" : ""
      }`}
      style={{
        background: selected ? value : "linear-gradient(135deg, #a3a3a3 0 50%, #e5e5e5 50% 100%)",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      PICK
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
      <path
        d="M10 13V3.5M6.5 7 10 3.5 13.5 7M4 12.5v3A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
