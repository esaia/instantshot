import { type Dispatch, useEffect, useMemo, useRef, useState } from "react";
import { type Mapping, sourcePerViewPx, sourceToView, viewToSource } from "./interaction/coords";
import { type HandleId, resize, translate } from "./interaction/handles";
import { handleAt, hitTest } from "./interaction/hitTest";
import { type TextDraft, TextEditor } from "./interaction/TextEditor";
import { type EditorAction, type EditorState, newId, textSize } from "./model/editorReducer";
import type { Annotation, Point, Tool } from "./model/types";
import { CHECKERBOARD } from "./panels/controls";
import { measureText } from "./render/annotations";
import { context2d } from "./render/canvas";
import { layoutFor, type RenderAssets, renderComposition } from "./render/compose";
import { boxFrom } from "./render/geometry";

/** Space around the composition inside the stage, CSS px. */
const MARGIN = 32;
/** Pointer tolerance, CSS px. */
const TOLERANCE = 6;

type Gesture =
  | { kind: "draw"; start: Point }
  /** Opened on pointer up, so the click's own focus change can't close the text box. */
  | { kind: "text"; at: Point; existing: Annotation | null }
  | { kind: "move"; start: Point; original: Annotation }
  | { kind: "resize"; handle: HandleId; original: Annotation };

export function Stage({
  state,
  assets,
  dispatch,
  editTextId,
  onEditText,
}: {
  state: EditorState;
  assets: RenderAssets;
  dispatch: Dispatch<EditorAction>;
  /** Text annotation to open for editing (e.g. after a double-click), set by the parent. */
  editTextId: string | null;
  onEditText: (id: string | null) => void;
}) {
  const doc = state.history.present;
  const { source } = assets;
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [text, setText] = useState<TextDraft | null>(null);
  const [hover, setHover] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  /** Where the text being edited sits, source px. */
  const textAnchor = useRef<{ x: number; y: number; size: number } | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setArea({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { layout, crop } = useMemo(() => layoutFor(source, doc.style), [source, doc.style]);
  const view = Math.max(
    0.05,
    Math.min((area.w - MARGIN * 2) / layout.width, (area.h - MARGIN * 2) / layout.height, 1),
  );
  const mapping: Mapping = { layout, crop, view };
  const cssW = Math.round(layout.width * view);
  const cssH = Math.round(layout.height * view);

  // Repaint on any change, at most once per frame.
  useEffect(() => {
    const el = canvas.current;
    if (!el || area.w === 0) return;
    const frame = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      renderComposition(context2d(el), doc, assets, {
        scale: (w / layout.width + h / layout.height) / 2,
        draft,
        hiddenId: text?.id ?? null,
        selectedId: text ? null : state.selectedId,
        handleSize: 8 * dpr,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, assets, draft, text, state.selectedId, cssW, cssH, layout, area.w]);

  const tol = TOLERANCE * sourcePerViewPx(mapping);
  const strokeWidth = state.strokeWidth * source.scale;

  const openText = (at: Point, existing: Annotation | null) => {
    if (existing && existing.type !== "text") return;
    const size =
      existing?.type === "text" ? existing.size : textSize(state.strokeWidth) * source.scale;
    const pos = sourceToView(mapping, existing?.type === "text" ? existing : at);
    setText({
      id: existing?.id ?? null,
      text: existing?.type === "text" ? existing.text : "",
      color: existing?.color ?? state.color,
      fontSize: size / sourcePerViewPx(mapping),
      x: pos.x,
      y: pos.y,
    });
    textAnchor.current =
      existing?.type === "text" ? { x: existing.x, y: existing.y, size } : { ...at, size };
  };

  // A double-click in the parent (or the text tool) asks to edit an existing text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reacts to new edit requests
  useEffect(() => {
    if (!editTextId) return;
    const existing = doc.annotations.find((a) => a.id === editTextId) ?? null;
    if (existing?.type === "text") openText(existing, existing);
    onEditText(null);
  }, [editTextId]);

  const commitText = (value: string) => {
    const draftText = text;
    const anchor = textAnchor.current;
    setText(null);
    if (!draftText || !anchor) return;
    const trimmed = value.replace(/\s+$/, "");
    if (!trimmed) {
      if (draftText.id) dispatch({ type: "delete", id: draftText.id });
      return;
    }
    const { w, h } = measureText(trimmed, anchor.size);
    const annotation: Annotation = {
      id: draftText.id ?? newId(),
      type: "text",
      text: trimmed,
      size: anchor.size,
      x: anchor.x,
      y: anchor.y,
      w,
      h,
      color: draftText.color,
      width: strokeWidth,
    };
    dispatch(draftText.id ? { type: "update", annotation } : { type: "add", annotation });
    dispatch({ type: "tool", tool: "select" });
    dispatch({ type: "select", id: annotation.id });
  };

  const create = (tool: Tool, a: Point, b: Point, id: string): Annotation | null => {
    const base = { id, color: state.color, width: strokeWidth };
    switch (tool) {
      case "arrow":
        return { ...base, type: "arrow", from: a, to: b };
      case "rect":
      case "ellipse":
      case "blur":
      case "pixelate":
        return { ...base, type: tool, ...boxFrom(a, b) };
      default:
        return null;
    }
  };

  const pointFrom = (e: React.PointerEvent): Point => {
    // biome-ignore lint/style/noNonNullAssertion: events only fire while the canvas is mounted
    const r = canvas.current!.getBoundingClientRect();
    return viewToSource(mapping, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const selected = doc.annotations.find((a) => a.id === state.selectedId) ?? null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || text || e.target instanceof HTMLTextAreaElement) return;
    const p = pointFrom(e);
    const hit = hitTest(doc.annotations, p, tol);
    if (state.tool === "text") {
      gesture.current = { kind: "text", at: p, existing: hit?.type === "text" ? hit : null };
      return;
    }
    if (state.tool === "select") {
      const handle = selected ? handleAt(selected, p, tol * 1.5) : null;
      if (selected && handle) {
        gesture.current = { kind: "resize", handle: handle.id, original: selected };
      } else if (hit) {
        dispatch({ type: "select", id: hit.id });
        if (e.detail === 2 && hit.type === "text") {
          gesture.current = { kind: "text", at: hit, existing: hit };
          return;
        }
        gesture.current = { kind: "move", start: p, original: hit };
      } else {
        dispatch({ type: "select", id: null });
        return;
      }
    } else {
      gesture.current = { kind: "draw", start: p };
      setDraft(create(state.tool, p, p, newId()));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointFrom(e);
    const g = gesture.current;
    if (!g) {
      if (state.tool === "select") setHover(hitTest(doc.annotations, p, tol) !== null);
      return;
    }
    if (g.kind === "text") return;
    if (g.kind === "draw") {
      setDraft((d) => (d ? create(state.tool, g.start, p, d.id) : d));
    } else if (g.kind === "move") {
      const moved = translate(g.original, p.x - g.start.x, p.y - g.start.y);
      dispatch({ type: "update", annotation: moved, key: `move:${moved.id}` });
    } else {
      const resized = resize(g.original, g.handle, p);
      dispatch({ type: "update", annotation: resized, key: `resize:${resized.id}` });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "text") {
      openText(g.at, g.existing);
    } else if (g?.kind === "draw") {
      // Built from the release point: the rendered draft may lag behind fast drags.
      const d = create(state.tool, g.start, pointFrom(e), draft?.id ?? newId());
      setDraft(null);
      if (!d) return;
      const big =
        d.type === "arrow"
          ? Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) > tol * 2
          : d.type !== "text" && d.w > tol && d.h > tol;
      if (big) dispatch({ type: "add", annotation: d });
    } else if (g) {
      dispatch({ type: "seal" });
    }
  };

  const cursor =
    state.tool === "select"
      ? hover
        ? "move"
        : "default"
      : state.tool === "text"
        ? "text"
        : "crosshair";

  return (
    // Pointer handling covers the whole stage so shapes can start next to the image.
    <div
      ref={container}
      className="relative flex min-h-0 min-w-0 flex-1 touch-none items-center justify-center overflow-hidden bg-neutral-200/70 dark:bg-neutral-950"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(false)}
    >
      <div className="relative" style={{ width: cssW, height: cssH }}>
        {doc.style.background.kind === "none" && (
          <div className="absolute inset-0 rounded-sm" style={CHECKERBOARD} />
        )}
        <canvas ref={canvas} className="relative block size-full" />
        {text && <TextEditor draft={text} onCommit={commitText} onCancel={() => setText(null)} />}
      </div>
    </div>
  );
}
