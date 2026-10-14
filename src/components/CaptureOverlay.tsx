import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, onEvent } from "../lib/tauri";
import type { CaptureMode, FinishAction, SelectionRect } from "../lib/types";

/** Matches `geometry::MIN_SELECTION` in Rust. */
const MIN_SELECTION = 4;
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
 * (move, resize) until the user picks Copy or Edit.
 */
export function CaptureOverlay() {
  const [session, setSession] = useState<number | null>(null);
  const [mode, setMode] = useState<CaptureMode>("text");
  const [rect, setRect] = useState<SelectionRect | null>(null);
  /** Screenshot mode: the drag finished and the selection can be adjusted. */
  const [adjusting, setAdjusting] = useState(false);
  const [hoverCursor, setHoverCursor] = useState("crosshair");
  const sessionRef = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);

  // Pull the active session on load and whenever Rust announces a new one, reset, then ack.
  useEffect(() => {
    const begin = async () => {
      const s = await api.overlaySession();
      if (s === null) return;
      flushSync(() => {
        gesture.current = null;
        sessionRef.current = s.session;
        setSession(s.session);
        setMode(s.mode);
        setRect(null);
        setAdjusting(false);
        setHoverCursor("crosshair");
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

  const finish = useCallback((selection: SelectionRect, action?: FinishAction) => {
    const s = sessionRef.current;
    sessionRef.current = null;
    gesture.current = null;
    setSession(null);
    setRect(null);
    setAdjusting(false);
    if (s !== null) void api.finishSelection(s, selection, action);
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
        } else if (key === "e" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          finish(rect, "edit");
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
        setHoverCursor(handle ? HANDLE_CURSOR[handle] : inside(rect, x, y) ? "move" : "crosshair");
      }
      return;
    }
    if (g.kind === "draw") setRect(rectFrom(g.x0, g.y0, x, y));
    else if (g.kind === "move") setRect(moved(g.original, x - g.x0, y - g.y0));
    else setRect(resized(g.original, g.handle, x, y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const x = clampX(e.clientX);
    const y = clampY(e.clientY);
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
      {session !== null && !rect && <div className="absolute inset-0 bg-black/20" />}
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
                "0 0 0 1px rgba(255,255,255,0.95), 0 0 0 2px rgba(0,0,0,0.35), 0 0 0 100vmax rgba(0,0,0,0.28)",
            }}
          />
          <SizeLabel rect={rect} scale={scale} />
          {adjusting && (
            <>
              {HANDLES.map((h) => {
                const p = handlePoint(rect, h);
                return (
                  <div
                    key={h}
                    className="pointer-events-none absolute size-[9px] rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                    style={{ left: p.x - 4.5, top: p.y - 4.5 }}
                  />
                );
              })}
              <ActionBar
                rect={rect}
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

const BAR_WIDTH = 220;
const BAR_HEIGHT = 40;

/** Copy / Edit / Close, below the selection (or above, or inside when there's no room). */
function ActionBar({
  rect,
  onCopy,
  onEdit,
  onCancel,
}: {
  rect: SelectionRect;
  onCopy: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
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
      <button
        type="button"
        title="Copy (Return)"
        onClick={onCopy}
        className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg bg-white text-neutral-900 hover:bg-neutral-100"
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
        className="flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg hover:bg-white/10"
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
