import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { translate } from "../editor/interaction/handles";
import { decodeRawFrame } from "../editor/lib/rawFrame";
import { INK_COLORS, STROKE_WIDTHS } from "../editor/model/editorReducer";
import type { Annotation } from "../editor/model/types";
import { drawAnnotation } from "../editor/render/annotations";
import { api, onEvent } from "../lib/tauri";
import type { CaptureMode, FinishAction, Markup, SelectionRect } from "../lib/types";

/** Matches `geometry::MIN_SELECTION` in Rust. */
const MIN_SELECTION = 4;
/** Shorter drags than this (CSS px) don't leave a shape behind. */
const MIN_SHAPE = 3;

type DrawTool = "pen" | "arrow" | "rect" | "ellipse";
type ShapeTool = Exclude<DrawTool, "pen">;

const DRAW_TOOLS: { id: DrawTool; label: string; key: string; icon: ReactNode }[] = [
  {
    id: "pen",
    label: "Draw",
    key: "D",
    icon: <path d="M3.5 14.5c1.8-2.6 3.3-7 5.3-7 1.8 0 .6 5 2.6 5 1.6 0 2.5-3 5.1-6.5" />,
  },
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
];
const TOOL_KEYS: Record<string, DrawTool> = { d: "pen", a: "arrow", r: "rect", o: "ellipse" };

let nextShape = 0;

/** A shape from a drag, in window-local CSS px (the same space as the selection). */
function shapeFrom(
  tool: ShapeTool,
  color: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Annotation {
  const base = { id: `o${nextShape++}`, color, width: STROKE_WIDTHS[1] };
  if (tool === "arrow")
    return { ...base, type: "arrow", from: { x: x0, y: y0 }, to: { x: x1, y: y1 } };
  const r = rectFrom(x0, y0, x1, y1);
  return { ...base, type: tool, x: r.x, y: r.y, w: r.width, h: r.height };
}

/** Draws `shapes` clipped to `clip`, with CSS px mapped to `scale` device pixels. */
function paintShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Annotation[],
  clip: SelectionRect,
  scale: number,
  origin = { x: 0, y: 0 },
) {
  ctx.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.width, clip.height);
  ctx.clip();
  for (const shape of shapes) drawAnnotation(ctx, shape);
  ctx.restore();
}

/** Draws a raw frame into `canvas` at full resolution. Returns whether it worked. */
function paintFrozen(canvas: HTMLCanvasElement | null, buffer: ArrayBuffer): boolean {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return false;
  const frame = decodeRawFrame(buffer);
  canvas.width = frame.width;
  canvas.height = frame.height;
  // Copy: the frame views a larger buffer, which ImageData doesn't accept.
  ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width), 0, 0);
  return true;
}

/** Overlay shapes for Rust: editable copies relative to the selection, plus a PNG for Copy. */
async function markupFor(
  shapes: Annotation[],
  selection: SelectionRect,
  action: FinishAction,
): Promise<Markup | undefined> {
  if (shapes.length === 0) return undefined;
  const annotations = shapes.map((a) => translate(a, -selection.x, -selection.y));
  if (action !== "copy") return { annotations };
  const scale = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(selection.width * scale));
  canvas.height = Math.max(1, Math.round(selection.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { annotations };
  paintShapes(ctx, shapes, selection, scale, selection);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) return { annotations };
  return { annotations, layer: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}
/** Grab distance around a resize handle, CSS px. */
const HANDLE_REACH = 8;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

type Gesture =
  | { kind: "draw"; x0: number; y0: number }
  | { kind: "shape"; tool: ShapeTool; x0: number; y0: number }
  /** Freehand stroke; points are collected here so fast drags never drop any. */
  | { kind: "pen"; shape: Annotation & { type: "pen" } }
  | { kind: "move"; x0: number; y0: number; original: SelectionRect }
  | { kind: "resize"; handle: Handle; original: SelectionRect };

const clampX = (x: number) => Math.max(0, Math.min(window.innerWidth, x));
const clampY = (y: number) => Math.max(0, Math.min(window.innerHeight, y));

function rectFrom(x0: number, y0: number, x1: number, y1: number): SelectionRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function handlePoint(r: SelectionRect, h: Handle) {
  const x = h.includes("w") ? r.x : h.includes("e") ? r.x + r.width : r.x + r.width / 2;
  const y = h.includes("n") ? r.y : h.includes("s") ? r.y + r.height : r.y + r.height / 2;
  return { x, y };
}

function handleAt(r: SelectionRect, x: number, y: number): Handle | null {
  return (
    HANDLES.find((h) => {
      const p = handlePoint(r, h);
      return Math.abs(p.x - x) <= HANDLE_REACH && Math.abs(p.y - y) <= HANDLE_REACH;
    }) ?? null
  );
}

const inside = (r: SelectionRect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

function resized(r: SelectionRect, h: Handle, x: number, y: number): SelectionRect {
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.width;
  let y1 = r.y + r.height;
  if (h.includes("w")) x0 = clampX(x);
  if (h.includes("e")) x1 = clampX(x);
  if (h.includes("n")) y0 = clampY(y);
  if (h.includes("s")) y1 = clampY(y);
  return rectFrom(x0, y0, x1, y1);
}

function moved(r: SelectionRect, dx: number, dy: number): SelectionRect {
  return {
    ...r,
    x: Math.max(0, Math.min(window.innerWidth - r.width, r.x + dx)),
    y: Math.max(0, Math.min(window.innerHeight - r.height, r.y + dy)),
  };
}

/**
 * Full-screen selection layer for one display. Coordinates are window-local CSS pixels, which
 * Rust converts to native units. The selected area is a clear "hole": the dim is drawn around it
 * and the border sits outside it, so the pixels being captured are never tinted.
 *
 * Text mode captures as soon as the drag ends. Screenshot mode keeps the selection adjustable
 * (move, resize) until the user picks Copy or Edit, and offers quick annotations (arrow,
 * rectangle, ellipse) drawn over the screen: Copy bakes them into the image, Edit hands them to
 * the editor as editable shapes.
 */
export function CaptureOverlay() {
  const [session, setSession] = useState<number | null>(null);
  const [mode, setMode] = useState<CaptureMode>("text");
  const [rect, setRect] = useState<SelectionRect | null>(null);
  /** Screenshot mode: the drag finished and the selection can be adjusted. */
  const [adjusting, setAdjusting] = useState(false);
  const [hoverCursor, setHoverCursor] = useState("crosshair");
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [color, setColor] = useState(INK_COLORS[0]);
  const [shapes, setShapes] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const sessionRef = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** The screen as it was when the shortcut was pressed, so video and animations stand still. */
  const frozenCanvas = useRef<HTMLCanvasElement>(null);
  const [frozen, setFrozen] = useState(false);

  // Pull the active session on load and whenever Rust announces a new one, reset, then ack.
  useEffect(() => {
    const begin = async () => {
      const s = await api.overlaySession();
      if (s === null) return;
      // Paint the frozen screen before acking, so the overlay is revealed already still.
      const painted = await api
        .overlayFrame()
        .then((buffer) => paintFrozen(frozenCanvas.current, buffer))
        .catch(() => false);
      flushSync(() => {
        setFrozen(painted);
        gesture.current = null;
        sessionRef.current = s.session;
        setSession(s.session);
        setMode(s.mode);
        setRect(null);
        setAdjusting(false);
        setHoverCursor("crosshair");
        setTool(null);
        setShapes([]);
        setDraft(null);
      });
      await api.overlayReady(s.session);
    };
    void begin();
    const offBegin = onEvent<number>("overlay:begin", () => void begin());
    const offMode = onEvent<CaptureMode>("overlay:mode", setMode);
    return () => {
      offBegin();
      offMode();
    };
  }, []);

  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  const finish = useCallback((selection: SelectionRect, action?: FinishAction) => {
    const s = sessionRef.current;
    const drawn = shapesRef.current;
    sessionRef.current = null;
    gesture.current = null;
    setSession(null);
    setRect(null);
    setAdjusting(false);
    setShapes([]);
    setDraft(null);
    if (s === null) return;
    if (!action) {
      void api.finishSelection(s, selection);
      return;
    }
    void markupFor(drawn, selection, action)
      .catch(() => undefined)
      .then((markup) => api.finishSelection(s, selection, action, markup));
  }, []);

  const cancel = useCallback(() => {
    const s = sessionRef.current;
    gesture.current = null;
    setRect(null);
    setAdjusting(false);
    if (s !== null) void api.cancelCapture(s);
  }, []);

  // Switching to text mode while adjusting captures the current selection as text.
  useEffect(() => {
    if (mode === "text" && adjusting && rect) finish(rect);
  }, [mode, adjusting, rect, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (adjusting && rect) {
        const key = e.key.toLowerCase();
        if (key === "enter" || ((e.metaKey || e.ctrlKey) && key === "c")) {
          e.preventDefault();
          finish(rect, "copy");
        } else if ((e.metaKey || e.ctrlKey) && key === "z") {
          e.preventDefault();
          setShapes((list) => list.slice(0, -1));
        } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          if (key === "e") {
            e.preventDefault();
            finish(rect, "edit");
          } else if (key === "v") {
            setTool(null);
          } else if (TOOL_KEYS[key]) {
            const next = TOOL_KEYS[key];
            setTool((t) => (t === next ? null : next));
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, finish, adjusting, rect]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || session === null) return;
    const { clientX: x, clientY: y } = e;
    const handle = adjusting && rect ? handleAt(rect, x, y) : null;
    if (adjusting && rect && handle) {
      gesture.current = { kind: "resize", handle, original: rect };
    } else if (adjusting && rect && tool === "pen") {
      const shape = {
        id: `o${nextShape++}`,
        type: "pen" as const,
        points: [{ x, y }],
        color,
        width: STROKE_WIDTHS[1],
      };
      gesture.current = { kind: "pen", shape };
      setDraft(shape);
    } else if (adjusting && rect && tool && tool !== "pen") {
      gesture.current = { kind: "shape", tool, x0: x, y0: y };
      setDraft(shapeFrom(tool, color, x, y, x, y));
    } else if (adjusting && rect && inside(rect, x, y)) {
      gesture.current = { kind: "move", x0: x, y0: y, original: rect };
    } else {
      gesture.current = { kind: "draw", x0: x, y0: y };
      setAdjusting(false);
      setRect(rectFrom(x, y, x, y));
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; dragging still works.
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const x = clampX(e.clientX);
    const y = clampY(e.clientY);
    if (!g) {
      if (adjusting && rect) {
        const handle = handleAt(rect, x, y);
        setHoverCursor(
          handle ? HANDLE_CURSOR[handle] : !tool && inside(rect, x, y) ? "move" : "crosshair",
        );
      }
      return;
    }
    if (g.kind === "pen") {
      const { points } = g.shape;
      const last = points[points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) < 1.5) return;
      g.shape = { ...g.shape, points: [...points, { x, y }] };
      setDraft(g.shape);
    } else if (g.kind === "shape") setDraft(shapeFrom(g.tool, color, g.x0, g.y0, x, y));
    else if (g.kind === "draw") setRect(rectFrom(g.x0, g.y0, x, y));
    else if (g.kind === "move") setRect(moved(g.original, x - g.x0, y - g.y0));
    else setRect(resized(g.original, g.handle, x, y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const x = clampX(e.clientX);
    const y = clampY(e.clientY);
    if (g.kind === "pen") {
      setDraft(null);
      // A click without dragging leaves a dot.
      const shape = g.shape;
      setShapes((list) => [...list, shape]);
      return;
    }
    if (g.kind === "shape") {
      setDraft(null);
      if (Math.hypot(x - g.x0, y - g.y0) >= MIN_SHAPE) {
        const shape = shapeFrom(g.tool, color, g.x0, g.y0, x, y);
        setShapes((list) => [...list, shape]);
      }
      return;
    }
    const next =
      g.kind === "draw"
        ? rectFrom(g.x0, g.y0, x, y)
        : g.kind === "move"
          ? moved(g.original, x - g.x0, y - g.y0)
          : resized(g.original, g.handle, x, y);
    if (next.width < MIN_SELECTION || next.height < MIN_SELECTION) {
      // A click or tiny drag: keep the overlay open for another attempt.
      if (g.kind === "draw") {
        setRect(null);
        setAdjusting(false);
      } else {
        setRect(g.original);
      }
      return;
    }
    if (mode === "text") {
      finish(next);
      return;
    }
    setRect(next);
    setAdjusting(true);
  };

  const scale = window.devicePixelRatio || 1;
  const cursor = gesture.current?.kind === "move" ? "move" : adjusting ? hoverCursor : "crosshair";

  // Shapes are painted with the editor's renderer, so they look the same after Copy or Edit.
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const w = Math.round(window.innerWidth * scale);
    const h = Math.round(window.innerHeight * scale);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (rect && (shapes.length > 0 || draft)) {
      paintShapes(ctx, draft ? [...shapes, draft] : shapes, rect, scale);
    }
  }, [shapes, draft, rect, scale]);

  return (
    <div
      role="application"
      aria-label={
        mode === "text"
          ? "Drag to select text on screen. Press Escape to cancel."
          : "Drag to select a screenshot area, then copy or edit it. Press Escape to cancel."
      }
      className="fixed inset-0 select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={frozenCanvas}
        className="pointer-events-none absolute inset-0 size-full"
        style={{ visibility: frozen ? "visible" : "hidden" }}
      />
      {session !== null && !rect && <div className="absolute inset-0 bg-black/25" />}
      {session !== null && rect && (
        <>
          <div
            className="absolute"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              // Outer shadows only: white border, dark contrast ring, then the dim.
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.95), 0 0 0 2px rgba(0,0,0,0.35), 0 0 0 100vmax rgba(0,0,0,0.35)",
            }}
          />
          <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" />
          <SizeLabel rect={rect} scale={scale} />
          {adjusting && (
            <>
              {HANDLES.map((h) => {
                const p = handlePoint(rect, h);
                return (
                  <div
                    key={h}
                    className="pointer-events-none absolute size-[9px] rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_1px_3px_rgba(0,0,0,0.3)]"
                    style={{ left: p.x - 4.5, top: p.y - 4.5 }}
                  />
                );
              })}
              <ActionBar
                rect={rect}
                tool={tool}
                color={color}
                canUndo={shapes.length > 0}
                onTool={(t) => setTool((current) => (current === t ? null : t))}
                onColor={setColor}
                onUndo={() => setShapes((list) => list.slice(0, -1))}
                onCopy={() => finish(rect, "copy")}
                onEdit={() => finish(rect, "edit")}
                onCancel={cancel}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function SizeLabel({ rect, scale }: { rect: SelectionRect; scale: number }) {
  // Above the top-left corner when there's room, otherwise just inside it.
  const above = rect.y >= 30;
  return (
    <div
      className="pointer-events-none absolute rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
      style={{
        left: Math.min(Math.max(rect.x, 4), window.innerWidth - 90),
        top: above ? rect.y - 26 : rect.y + 6,
      }}
    >
      {Math.round(rect.width * scale)} × {Math.round(rect.height * scale)}
    </div>
  );
}

/** Fits the tools, color, undo, Copy, Edit and Cancel; grow it when adding a button. */
const BAR_WIDTH = 440;
const BAR_HEIGHT = 40;

/**
 * Drawing tools, Copy / Edit / Close, below the selection (or above, or inside when there's no
 * room).
 */
function ActionBar({
  rect,
  tool,
  color,
  canUndo,
  onTool,
  onColor,
  onUndo,
  onCopy,
  onEdit,
  onCancel,
}: {
  rect: SelectionRect;
  tool: DrawTool | null;
  color: string;
  canUndo: boolean;
  onTool: (tool: DrawTool) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const [palette, setPalette] = useState(false);
  const gap = 10;
  const below = rect.y + rect.height + gap + BAR_HEIGHT <= window.innerHeight - 8;
  const above = rect.y - gap - BAR_HEIGHT >= 8;
  const top = below
    ? rect.y + rect.height + gap
    : above
      ? rect.y - gap - BAR_HEIGHT
      : rect.y + rect.height - BAR_HEIGHT - gap;
  const left = Math.max(
    8,
    Math.min(window.innerWidth - BAR_WIDTH - 8, rect.x + rect.width / 2 - BAR_WIDTH / 2),
  );
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      className="absolute flex items-center gap-1 rounded-xl bg-neutral-900/90 p-1 text-[13px] font-medium text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
      style={{ left, top, height: BAR_HEIGHT, width: BAR_WIDTH, cursor: "default" }}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
    >
      {DRAW_TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          onClick={() => onTool(t.id)}
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
            tool === t.id ? "bg-white/20 text-sky-300" : "text-white/85 hover:bg-white/10"
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {t.icon}
          </svg>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          title="Color"
          aria-label="Color"
          aria-expanded={palette}
          onClick={() => setPalette((open) => !open)}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <span
            className="size-4 rounded-full ring-2 ring-white/70"
            style={{ backgroundColor: color }}
          />
        </button>
        {palette && (
          <div
            className={`absolute left-1/2 flex -translate-x-1/2 gap-1.5 rounded-xl bg-neutral-900/95 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md ${
              top > rect.y && top + BAR_HEIGHT + 48 <= window.innerHeight ? "top-10" : "bottom-10"
            }`}
          >
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                onClick={() => {
                  onColor(c);
                  setPalette(false);
                }}
                className={`size-5 rounded-full ring-offset-2 ring-offset-neutral-900 ${
                  c === color ? "ring-2 ring-white" : "ring-1 ring-white/25 hover:ring-white/60"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={onUndo}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/85 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7.5 5 4 8.5 7.5 12M4.5 8.5h7a4 4 0 0 1 0 8H9" />
        </svg>
      </button>
      <div className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
      <button
        type="button"
        title="Copy (Return)"
        onClick={onCopy}
        className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 text-neutral-900 hover:bg-neutral-100"
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
        <span className="text-[12px] text-neutral-400">↵</span>
      </button>
      <button
        type="button"
        title="Edit (E)"
        onClick={onEdit}
        className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 hover:bg-white/10"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 16l1-4L13.5 3.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L8 15l-4 1Z" />
        </svg>
        Edit
      </button>
      <div className="h-5 w-px bg-white/15" />
      <button
        type="button"
        title="Cancel (Esc)"
        aria-label="Cancel"
        onClick={onCancel}
        className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10"
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
