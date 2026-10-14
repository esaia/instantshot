import { type ReactNode, useState } from "react";
import type { SystemWallpaper } from "../../lib/types";
import { ASPECTS, clampCrop, LIMITS, type Section } from "../model/defaults";
import type { Background, ChromeId, Crop, EditorStyle } from "../model/types";
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

type Category = "background" | "frame" | "layout";

const CATEGORIES: { id: Category; label: string; icon: ReactNode }[] = [
  {
    id: "background",
    label: "Background",
    icon: (
      <>
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="m3.5 13.5 3.8-3.8 2.7 2.7 2-2 4.5 4.1" />
        <circle cx="13" cy="7.8" r="1.2" />
      </>
    ),
  },
  {
    id: "frame",
    label: "Frame",
    icon: (
      <>
        <rect x="3" y="3" width="14" height="14" rx="3" />
        <rect x="6.5" y="6.5" width="7" height="7" rx="1.2" />
      </>
    ),
  },
  {
    id: "layout",
    label: "Layout",
    icon: (
      <>
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M3 7.5h14" />
        <circle cx="5.3" cy="5.8" r=".4" />
        <circle cx="7" cy="5.8" r=".4" />
      </>
    ),
  },
];

const TAB_KEY = "editor.sidebarTab";

function storedTab(): Category {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "background" || v === "frame" || v === "layout") return v;
  } catch {
    // Storage can be unavailable; fall back to the first tab.
  }
  return "background";
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

  const [tab, setTab] = useState<Category>(storedTab);
  const choose = (next: Category) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
      <div className="shrink-0 border-b border-black/[0.06] p-3 dark:border-white/[0.06]">
        <div
          role="tablist"
          aria-label="Settings categories"
          className="flex gap-0.5 rounded-[10px] bg-black/[0.05] p-0.5 dark:bg-white/[0.06]"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={tab === c.id}
              onClick={() => choose(c.id)}
              className="flex h-7 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[12px] font-medium text-neutral-500 hover:text-neutral-800 aria-selected:bg-white aria-selected:text-blue-600 aria-selected:shadow-sm dark:text-neutral-400 dark:hover:text-neutral-100 dark:aria-selected:bg-neutral-700 dark:aria-selected:text-blue-300"
            >
              <svg
                viewBox="0 0 20 20"
                className="size-[15px] shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {c.icon}
              </svg>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === "background" && (
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
        )}

        {tab === "frame" && (
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
        )}

        {tab === "layout" && (
          <>
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
            <PanelSection title="Crop" onReset={() => onReset("crop")}>
              {(
                [
                  ["top", "Top"],
                  ["bottom", "Bottom"],
                  ["left", "Left"],
                  ["right", "Right"],
                ] as const
              ).map(([edge, label]) => (
                <Slider
                  key={edge}
                  label={label}
                  value={Math.round(style.crop[edge] * 100)}
                  min={0}
                  max={90}
                  format={(v) => `${v}%`}
                  onChange={(v) =>
                    onStyle(
                      { crop: clampCrop(style.crop, edge as keyof Crop, v / 100) },
                      `crop.${edge}`,
                    )
                  }
                  onCommit={onCommit}
                />
              ))}
            </PanelSection>
          </>
        )}
      </div>
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
