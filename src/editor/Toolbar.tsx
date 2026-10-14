import { type ReactNode, useEffect, useRef, useState } from "react";
import { type EditorAction, INK_COLORS, STROKE_WIDTHS } from "./model/editorReducer";
import type { Tool } from "./model/types";

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: <path d="M5 3.5 15 10l-4.6 1.1L8.2 15.6Z" /> },
  { id: "arrow", label: "Arrow", key: "A", icon: <path d="M4.5 15.5 15 5M8.5 5H15v6.5" /> },
  {
    id: "rect",
    label: "Rectangle",
    key: "R",
    icon: <rect x="3.5" y="5" width="13" height="10" rx="1.5" />,
  },
  {
    id: "ellipse",
    label: "Ellipse",
    key: "O",
    icon: <ellipse cx="10" cy="10" rx="6.5" ry="5.5" />,
  },
  { id: "text", label: "Text", key: "T", icon: <path d="M5 5.5V4h10v1.5M10 4v12M8 16h4" /> },
  {
    id: "blur",
    label: "Blur",
    key: "B",
    icon: <path d="M10 3.5s5 5.2 5 8.4a5 5 0 0 1-10 0c0-3.2 5-8.4 5-8.4Z" />,
  },
  {
    id: "pixelate",
    label: "Pixelate",
    key: "P",
    icon: <path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM4 12h4v4H4zM12 12h4v4h-4z" />,
  },
];

export function Toolbar({
  tool,
  color,
  strokeWidth,
  canUndo,
  canRedo,
  isMac,
  busy,
  dispatch,
  scale,
  onCopy,
  onSave,
  onQuickSave,
  onDragPointerDown,
}: {
  tool: Tool;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  isMac: boolean;
  busy: boolean;
  scale: number;
  dispatch: (action: EditorAction) => void;
  onCopy: () => void;
  onSave: () => void;
  onQuickSave: () => void;
  onDragPointerDown: (e: React.PointerEvent) => void;
}) {
  const mod = isMac ? "⌘" : "Ctrl+";
  return (
    <header
      data-tauri-drag-region
      className="flex h-[52px] shrink-0 items-center border-b border-black/10 bg-neutral-50 dark:border-white/10 dark:bg-neutral-900"
    >
      {/* Over the canvas: ink and history, then the tools, centered on the image area. The
          spacers grow equally; the left one never gets narrower than the traffic lights. */}
      <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 items-center">
        <div
          data-tauri-drag-region
          className={`h-full flex-1 ${isMac ? "min-w-[84px]" : "min-w-3"}`}
        />
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1 rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.07]">
            <InkPicker color={color} strokeWidth={strokeWidth} scale={scale} dispatch={dispatch} />
            <div className="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/10" />
            <IconButton
              label={`Undo (${mod}Z)`}
              disabled={!canUndo}
              onClick={() => dispatch({ type: "undo" })}
            >
              <path d="M7.5 6 4 9.5 7.5 13M4.5 9.5h7a4 4 0 0 1 0 8H9" />
            </IconButton>
            <IconButton
              label={`Redo (${isMac ? "⇧⌘Z" : "Ctrl+Y"})`}
              disabled={!canRedo}
              onClick={() => dispatch({ type: "redo" })}
            >
              <path d="M12.5 6 16 9.5 12.5 13M15.5 9.5h-7a4 4 0 0 0 0 8H11" />
            </IconButton>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.07]">
            {TOOLS.map((t) => (
              <IconButton
                key={t.id}
                label={`${t.label} (${t.key})`}
                active={tool === t.id}
                onClick={() => dispatch({ type: "tool", tool: t.id })}
              >
                {t.icon}
              </IconButton>
            ))}
          </div>
        </div>

        <div data-tauri-drag-region className="h-full min-w-3 flex-1" />
      </div>

      {/* Over the sidebar (same width): export */}
      <div
        data-tauri-drag-region
        className="flex h-full w-72 shrink-0 items-center justify-end gap-2 pr-3"
      >
        <button
          type="button"
          title="Drag the image into another app"
          aria-label="Drag the image into another app"
          onPointerDown={onDragPointerDown}
          className={`${ROUND_BUTTON} cursor-grab active:cursor-grabbing`}
        >
          <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
            <path
              d="M7.5 5h.01M12.5 5h.01M7.5 10h.01M12.5 10h.01M7.5 15h.01M12.5 15h.01"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <RoundButton
          label={`Quick save to folder (${isMac ? "⇧⌘S" : "Ctrl+Shift+S"})`}
          disabled={busy}
          onClick={onQuickSave}
        >
          <path d="M3.5 6.5v8A1.5 1.5 0 0 0 5 16h10a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 15 6.5H9.5L8 4.5H5A1.5 1.5 0 0 0 3.5 6v.5M10 9v4.5M8 11.5l2 2 2-2" />
        </RoundButton>
        <RoundButton label={`Save as… (${mod}S)`} disabled={busy} onClick={onSave}>
          <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7M4 12.5v2A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2" />
        </RoundButton>
        <button
          type="button"
          title={`Copy (${mod}C)`}
          disabled={busy}
          onClick={onCopy}
          className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-neutral-900 pr-4 pl-3.5 text-[13px] font-semibold text-white shadow-sm hover:bg-neutral-800 active:bg-black disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="7" y="7" width="9" height="9" rx="1.8" />
            <path d="M13 4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v6A1.5 1.5 0 0 0 5.5 12" />
          </svg>
          Copy
          <span className="font-medium opacity-50">{isMac ? "⌘C" : "Ctrl+C"}</span>
        </button>
      </div>
    </header>
  );
}

const ROUND_BUTTON =
  "flex size-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-neutral-700 hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15";

function RoundButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={ROUND_BUTTON}
    >
      <svg
        viewBox="0 0 20 20"
        className="size-[17px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/** One compact button for ink color and stroke width; the choices open in a popover. */
function InkPicker({
  color,
  strokeWidth,
  scale,
  dispatch,
}: {
  color: string;
  strokeWidth: number;
  scale: number;
  dispatch: (action: EditorAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const widthNames = ["Thin", "Medium", "Thick"];
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        title="Color and line width"
        aria-label="Color and line width"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex h-8 items-center gap-2 rounded-lg pr-1.5 pl-1 hover:bg-white aria-expanded:bg-white aria-expanded:shadow-sm dark:hover:bg-white/10 dark:aria-expanded:bg-neutral-700"
      >
        {/* Color well: the ink color inside a light rim, like a native picker. */}
        <span
          className="size-6 rounded-full border-[2.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.2)] dark:border-neutral-800 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.22)]"
          style={{ backgroundColor: color }}
        />
        <span className="flex w-5 items-center justify-center">
          <span
            className="w-full rounded-full"
            style={{ height: Math.max(2, strokeWidth * 0.55), backgroundColor: color }}
          />
        </span>
        <svg
          viewBox="0 0 10 10"
          className="size-2.5 text-neutral-400 transition-transform group-aria-expanded:rotate-180"
          aria-hidden="true"
        >
          <path
            d="M2.2 3.8 5 6.6l2.8-2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-30 w-[236px] rounded-2xl bg-white/95 p-3 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/10 backdrop-blur-xl dark:bg-neutral-800/95 dark:ring-white/10">
          <p className="mb-2 px-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Color
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === color}
                aria-label={c}
                title={c}
                onClick={() => dispatch({ type: "color", color: c })}
                className="flex aspect-square items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition-transform hover:scale-110 aria-pressed:shadow-[0_0_0_2px_white,0_0_0_4px_#0a84ff] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] dark:aria-pressed:shadow-[0_0_0_2px_#262626,0_0_0_4px_#0a84ff]"
                style={{ backgroundColor: c }}
              >
                {c === color && (
                  <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
                    <path
                      d="M2.5 6.2 5 8.6l4.5-5"
                      fill="none"
                      stroke={isLight(c) ? "#111" : "#fff"}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <p className="mt-3.5 mb-2 px-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Line width
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-black/[0.05] p-1 dark:bg-white/[0.06]">
            {STROKE_WIDTHS.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-pressed={w === strokeWidth}
                title={widthNames[i]}
                aria-label={widthNames[i]}
                onClick={() => dispatch({ type: "strokeWidth", width: w, scale })}
                className="flex h-8 items-center justify-center rounded-[7px] text-neutral-700 hover:bg-black/[0.04] aria-pressed:bg-white aria-pressed:shadow-sm dark:text-neutral-200 dark:hover:bg-white/5 dark:aria-pressed:bg-neutral-600"
              >
                <span
                  className="w-7 rounded-full"
                  style={{
                    height: w * 0.6,
                    backgroundColor: w === strokeWidth ? color : "currentColor",
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether a #rrggbb color is light enough to need a dark check mark. */
function isLight(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent aria-pressed:bg-white aria-pressed:text-blue-600 aria-pressed:shadow-sm dark:text-neutral-300 dark:hover:bg-white/10 dark:aria-pressed:bg-neutral-700 dark:aria-pressed:text-blue-400"
    >
      <svg
        viewBox="0 0 20 20"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
