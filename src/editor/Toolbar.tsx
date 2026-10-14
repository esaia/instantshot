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
      className={`relative flex h-[52px] shrink-0 items-center gap-2 border-b border-black/10 bg-neutral-50 pr-3 dark:border-white/10 dark:bg-neutral-900 ${
        isMac ? "pl-[88px]" : "pl-3"
      }`}
    >
      {/* Left: ink, undo/redo */}
      <InkPicker color={color} strokeWidth={strokeWidth} scale={scale} dispatch={dispatch} />
      <div className="flex shrink-0 items-center gap-0.5">
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

      {/* Center: tools, centered in the whole bar */}
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-xl bg-black/[0.05] p-1 dark:bg-white/[0.07]">
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

      <div data-tauri-drag-region className="h-full flex-1" />

      {/* Right: export */}
      <div className="flex shrink-0 items-center gap-2">
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

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        title="Color and line width"
        aria-label="Color and line width"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-black/5 aria-expanded:bg-black/5 dark:hover:bg-white/10 dark:aria-expanded:bg-white/10"
      >
        <span
          className="size-[18px] rounded-full ring-1 ring-black/15 dark:ring-white/25"
          style={{ backgroundColor: color }}
        />
        <span
          className="w-4 rounded-full bg-neutral-600 dark:bg-neutral-300"
          style={{ height: Math.max(2, strokeWidth * 0.6) }}
        />
        <svg viewBox="0 0 10 10" className="size-2.5 text-neutral-500" aria-hidden="true">
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-10 left-0 z-30 w-[212px] space-y-3 rounded-xl bg-white p-3 shadow-xl ring-1 ring-black/10 dark:bg-neutral-800 dark:ring-white/10">
          <div className="grid grid-cols-7 gap-2">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === color}
                aria-label={c}
                title={c}
                onClick={() => dispatch({ type: "color", color: c })}
                className="aspect-square rounded-full ring-1 ring-black/15 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-blue-500 dark:ring-white/25"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-white/5">
            {STROKE_WIDTHS.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-pressed={w === strokeWidth}
                title={["Thin", "Medium", "Thick"][i]}
                aria-label={["Thin", "Medium", "Thick"][i]}
                onClick={() => dispatch({ type: "strokeWidth", width: w, scale })}
                className="flex h-7 items-center justify-center rounded-md aria-pressed:bg-white aria-pressed:shadow-sm dark:aria-pressed:bg-neutral-600"
              >
                <span
                  className="w-6 rounded-full bg-neutral-700 dark:bg-neutral-200"
                  style={{ height: w * 0.6 }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-600 hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent aria-pressed:bg-white aria-pressed:text-blue-600 aria-pressed:shadow-sm dark:text-neutral-300 dark:hover:bg-white/10 dark:aria-pressed:bg-neutral-700 dark:aria-pressed:text-blue-400"
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
