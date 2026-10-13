import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, onEvent } from "../lib/tauri";
import type { SelectionRect } from "../lib/types";

/** Matches `geometry::MIN_SELECTION` in Rust. */
const MIN_SELECTION = 4;

interface Drag {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function toRect(d: Drag): SelectionRect {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    width: Math.abs(d.x1 - d.x0),
    height: Math.abs(d.y1 - d.y0),
  };
}

/**
 * Full-screen selection layer for one display. Coordinates are window-local CSS pixels, which
 * Rust converts to native units. The selected area is a clear "hole": the dim is drawn around it
 * and the border sits outside it, so the pixels being captured are never tinted.
 */
export function CaptureOverlay() {
  const [session, setSession] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const sessionRef = useRef<number | null>(null);
  const dragging = useRef(false);

  // Pull the active session on load and whenever Rust announces a new one, reset, then ack.
  useEffect(() => {
    const begin = async () => {
      const s = await api.overlaySession();
      if (s === null) return;
      flushSync(() => {
        dragging.current = false;
        sessionRef.current = s;
        setSession(s);
        setDrag(null);
      });
      await api.overlayReady(s);
    };
    void begin();
    return onEvent<number>("overlay:begin", () => void begin());
  }, []);

  const cancel = useCallback(() => {
    const s = sessionRef.current;
    dragging.current = false;
    setDrag(null);
    if (s !== null) void api.cancelCapture(s);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || session === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const x1 = Math.max(0, Math.min(window.innerWidth, e.clientX));
    const y1 = Math.max(0, Math.min(window.innerHeight, e.clientY));
    setDrag((d) => (d ? { ...d, x1, y1 } : d));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current || !drag) return;
    dragging.current = false;
    const rect = toRect({ ...drag, x1: e.clientX, y1: e.clientY });
    if (rect.width < MIN_SELECTION || rect.height < MIN_SELECTION) {
      // A click or tiny drag: keep the overlay open for another attempt.
      setDrag(null);
      return;
    }
    const s = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setDrag(null);
    if (s !== null) void api.finishSelection(s, rect);
  };

  const rect = drag ? toRect(drag) : null;
  const scale = window.devicePixelRatio || 1;

  return (
    <div
      role="application"
      aria-label="Drag to select text on screen. Press Escape to cancel."
      className="fixed inset-0 cursor-crosshair select-none"
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
        </>
      )}
    </div>
  );
}

function SizeLabel({ rect, scale }: { rect: SelectionRect; scale: number }) {
  const below = rect.y + rect.height + 28 < window.innerHeight;
  return (
    <div
      className="pointer-events-none absolute rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
      style={{
        left: Math.min(rect.x + rect.width + 6, window.innerWidth - 90),
        top: below ? rect.y + rect.height + 6 : Math.max(rect.y - 24, 4),
      }}
    >
      {Math.round(rect.width * scale)} × {Math.round(rect.height * scale)}
    </div>
  );
}
