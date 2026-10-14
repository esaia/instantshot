import type { SystemWallpaper } from "../../lib/types";
import { ASPECTS, LIMITS, type Section } from "../model/defaults";
import type { Background, ChromeId, EditorStyle } from "../model/types";
import { BackgroundPanel } from "./BackgroundPanel";
import { PanelSection, Segmented, Slider } from "./controls";

export interface SidebarProps {
  style: EditorStyle;
  systemWallpapers: SystemWallpaper[];
  customPreview: string | null;
  onStyle: (patch: Partial<EditorStyle>, key?: string) => void;
  onCommit: () => void;
  onReset: (section: Section) => void;
  onUpload: (file: File) => void;
}

export function Sidebar({
  style,
  systemWallpapers,
  customPreview,
  onStyle,
  onCommit,
  onReset,
  onUpload,
}: SidebarProps) {
  const slider = (key: "padding" | "inset" | "radius" | "shadow", label: string) => (
    <Slider
      label={label}
      value={style[key]}
      min={LIMITS[key][0]}
      max={LIMITS[key][1]}
      onChange={(v) => onStyle({ [key]: v }, key)}
      onCommit={onCommit}
    />
  );

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
      <BackgroundPanel
        background={style.background}
        systemWallpapers={systemWallpapers}
        customPreview={customPreview}
        blur={style.backgroundBlur}
        onBlur={(backgroundBlur) => onStyle({ backgroundBlur }, "backgroundBlur")}
        onBlurCommit={onCommit}
        onChange={(background: Background, key?: string) => onStyle({ background }, key)}
        onUpload={onUpload}
        onReset={() => onReset("background")}
      />

      <PanelSection title="Frame" onReset={() => onReset("frame")}>
        {slider("padding", "Padding")}
        {slider("inset", "Inset")}
        {slider("radius", "Corner radius")}
        {slider("shadow", "Shadow")}
        <Slider
          label="Shadow opacity"
          value={style.shadowOpacity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onStyle({ shadowOpacity: v }, "shadowOpacity")}
          onCommit={onCommit}
        />
      </PanelSection>

      <PanelSection title="Window" onReset={() => onReset("chrome")}>
        <Segmented<ChromeId>
          value={style.chrome}
          onChange={(chrome) => onStyle({ chrome })}
          options={[
            { id: "none", label: "None" },
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
        />
      </PanelSection>

      <PanelSection title="Size" onReset={() => onReset("aspect")}>
        <div className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={style.aspect === a.id}
              title={`${a.name} (${a.label})`}
              onClick={() => onStyle({ aspect: a.id })}
              className="flex flex-col items-center gap-1.5 rounded-lg px-1 pt-2.5 pb-2 text-neutral-500 ring-1 ring-black/10 hover:bg-black/[0.03] aria-pressed:bg-blue-500/10 aria-pressed:text-blue-600 aria-pressed:ring-2 aria-pressed:ring-blue-500 dark:text-neutral-400 dark:ring-white/10 dark:hover:bg-white/5 dark:aria-pressed:text-blue-300"
            >
              <AspectShape ratio={a.ratio} />
              <span className="text-[11px] font-semibold leading-none text-neutral-700 dark:text-neutral-200">
                {a.label}
              </span>
              <span className="text-[10px] leading-none">{a.name}</span>
            </button>
          ))}
        </div>
      </PanelSection>
    </aside>
  );
}

/** A small rectangle with the preset's proportions (Auto shows a dashed free shape). */
function AspectShape({ ratio }: { ratio: number | null }) {
  const box = 22;
  const w = ratio === null ? 20 : ratio >= 1 ? box : box * ratio;
  const h = ratio === null ? 15 : ratio >= 1 ? box / ratio : box;
  return (
    <span className="flex size-[22px] items-center justify-center">
      <span
        className={`rounded-[3px] border-[1.5px] border-current ${ratio === null ? "border-dashed" : ""}`}
        style={{ width: w, height: h }}
      />
    </span>
  );
}
