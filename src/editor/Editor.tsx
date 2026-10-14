import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, errorMessage, onEvent } from "../lib/tauri";
import type { SystemWallpaper } from "../lib/types";
import { screenshotFileName } from "./lib/fileName";
import { decodeRawFrame, dragPayload, toCanvas } from "./lib/rawFrame";
import { DEFAULT_STYLE, parseStyle } from "./model/defaults";
import { editorReducer, initialEditorState } from "./model/editorReducer";
import type { Background, Doc, EditorStyle, SourceImage } from "./model/types";
import { Sidebar } from "./panels/Sidebar";
import type { RenderAssets } from "./render/compose";
import { exportPng, exportThumbnail } from "./render/export";
import { edgeColor } from "./render/imageAnalysis";
import { Stage } from "./Stage";
import { Toolbar } from "./Toolbar";
import { useEditorKeyboard } from "./useEditorKeyboard";
import { generatedWallpaper, systemWallpaper } from "./wallpapers/cache";

const isMac = navigator.userAgent.includes("Mac");
/** Pointer travel before a press on the drag handle becomes a drag, CSS px. */
const DRAG_THRESHOLD = 4;
/** Idle time after an edit before the export is pre-rendered for instant copy/drag. */
const PRERENDER_DELAY = 350;
const STYLE_SAVE_DELAY = 500;

interface Toast {
  message: string;
  reveal?: boolean;
  error?: boolean;
}

interface Rendered {
  doc: Doc;
  assets: RenderAssets;
  png: Promise<Uint8Array>;
  thumb?: Promise<Uint8Array>;
}

interface LoadedBackground {
  image: CanvasImageSource;
  width: number;
  height: number;
}

function analyze(buffer: ArrayBuffer): SourceImage {
  const frame = decodeRawFrame(buffer);
  const { width, height, pixels } = frame;
  return {
    width,
    height,
    scale: frame.scale,
    bitmap: toCanvas(frame),
    edgeColor: edgeColor(pixels, width, height),
  };
}

const backgroundKey = (bg: Background) =>
  bg.kind === "wallpaper" || bg.kind === "system" ? `${bg.kind}:${bg.id}` : bg.kind;

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : path;
}

export function Editor() {
  const [state, dispatch] = useReducer(editorReducer, DEFAULT_STYLE, initialEditorState);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [systemWallpapers, setSystemWallpapers] = useState<SystemWallpaper[]>([]);
  const [custom, setCustom] = useState<{ image: HTMLImageElement; url: string } | null>(null);
  const [background, setBackground] = useState<LoadedBackground | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [editTextId, setEditTextId] = useState<string | null>(null);
  const fileName = useRef(screenshotFileName(new Date()));
  const styleLoaded = useRef(false);
  const doc = state.history.present;
  /** Rendered export for the current document (see `rendered`). */
  const cache = useRef<Rendered | null>(null);
  const docRef = useRef<Doc>(doc);
  docRef.current = doc;

  // ---- Loading ----

  /** Fetches the screenshot. `requested` is false for the preload, when there may be none. */
  const loadImage = useCallback(async (requested: boolean) => {
    try {
      const image = analyze(await api.editorImage());
      fileName.current = screenshotFileName(new Date());
      setSource(image);
      setError(null);
      // Each screenshot starts with no annotations but keeps the current style.
      dispatch({ type: "load", style: docRef.current.style });
    } catch (err) {
      if (!requested) return;
      setError(errorMessage(err));
      void api.editorReady();
    }
  }, []);

  useEffect(() => {
    // Style first: the page is preloaded hidden, so the wallpaper is ready before any capture.
    void api
      .getEditorStyle()
      .catch(() => null)
      .then((stored) => {
        dispatch({ type: "load", style: parseStyle(stored) });
        styleLoaded.current = true;
        return loadImage(false);
      });
    void api.listSystemWallpapers().then(setSystemWallpapers, () => {});
    const offLoad = onEvent("editor:load", () => void loadImage(true));
    // Hidden after close: drop the screenshot so its memory is released.
    const offHidden = onEvent("editor:hidden", () => {
      setSource(null);
      setToast(null);
      cache.current = null;
    });
    return () => {
      offLoad();
      offHidden();
    };
  }, [loadImage]);

  // Show the window once the first frame is on screen.
  useEffect(() => {
    if (!source) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => void api.editorReady()));
    return () => cancelAnimationFrame(id);
  }, [source]);

  // ---- Background image ----

  const bg = doc.style.background;
  const bgKey = backgroundKey(bg);
  // biome-ignore lint/correctness/useExhaustiveDependencies: bgKey identifies the background
  useEffect(() => {
    let alive = true;
    const pending =
      bg.kind === "wallpaper"
        ? generatedWallpaper(bg.id)
        : bg.kind === "system"
          ? systemWallpaper(bg.id)
          : bg.kind === "custom"
            ? Promise.resolve(custom?.image ?? null)
            : null;
    if (!pending) return;
    void pending.then((image) => {
      if (!alive) return;
      if (!image) {
        setBackground(null);
        return;
      }
      const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
      const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
      setBackground({ image, width, height });
    });
    return () => {
      alive = false;
    };
  }, [bgKey, custom]);

  const assets: RenderAssets | null = useMemo(() => {
    if (!source) return null;
    const usesImage = bg.kind === "wallpaper" || bg.kind === "system" || bg.kind === "custom";
    return {
      source,
      background: usesImage && background ? background.image : null,
      backgroundSize: usesImage && background ? background : null,
    };
  }, [source, background, bg.kind]);

  const upload = async (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      setToast({ message: "That image couldn't be opened", error: true });
      return;
    }
    if (custom) URL.revokeObjectURL(custom.url);
    setCustom({ image, url });
    dispatch({ type: "style", patch: { background: { kind: "custom" } } });
  };

  // ---- Persist the style for the next screenshot ----

  useEffect(() => {
    if (!styleLoaded.current) return;
    const style: EditorStyle = doc.style;
    const id = setTimeout(() => void api.setEditorStyle(style).catch(() => {}), STYLE_SAVE_DELAY);
    return () => clearTimeout(id);
  }, [doc.style]);

  // ---- Export (cached per document, pre-rendered when idle) ----

  const rendered = useCallback((): Rendered | null => {
    if (!assets) return null;
    const c = cache.current;
    if (c && c.doc === doc && c.assets === assets) return c;
    const next: Rendered = { doc, assets, png: exportPng(doc, assets) };
    next.png.catch(() => {});
    cache.current = next;
    return next;
  }, [doc, assets]);

  useEffect(() => {
    const id = setTimeout(() => rendered(), PRERENDER_DELAY);
    return () => clearTimeout(id);
  }, [rendered]);

  const run = async (task: (png: Uint8Array) => Promise<Toast | null>) => {
    const r = rendered();
    if (!r || busy) return;
    setBusy(true);
    try {
      const result = await task(await r.png);
      if (result) setToast(result);
    } catch (err) {
      setToast({ message: errorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  };

  const copy = () =>
    run(async (png) => {
      await api.copyImage(png);
      return { message: "Copied to clipboard" };
    });
  const save = () =>
    run(async (png) => {
      const path = await api.saveImage(png, fileName.current);
      return path ? { message: `Saved to ${folderName(path)}`, reveal: true } : null;
    });
  const quickSave = () =>
    run(async (png) => {
      const path = await api.quickSave(png, fileName.current);
      return { message: `Saved to ${folderName(path)}`, reveal: true };
    });

  const startDrag = async () => {
    const r = rendered();
    if (!r || !assets) return;
    r.thumb ??= exportThumbnail(r.doc, r.assets);
    try {
      const [thumb, png] = await Promise.all([r.thumb, r.png]);
      await api.startDrag(dragPayload(thumb, png), fileName.current);
    } catch (err) {
      setToast({ message: errorMessage(err), error: true });
    }
  };

  const onDragPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const r = rendered();
    if (r) r.thumb ??= exportThumbnail(r.doc, r.assets);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD) return;
      stop();
      void startDrag();
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.reveal ? 4000 : 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- Keyboard ----

  const selected = doc.annotations.find((a) => a.id === state.selectedId) ?? null;
  useEditorKeyboard(
    {
      copy: () => void copy(),
      save: () => void save(),
      quickSave: () => void quickSave(),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      close: () => void api.closeWindow(),
      deleteSelection: () => selected && dispatch({ type: "delete", id: selected.id }),
      escape: () =>
        selected
          ? dispatch({ type: "select", id: null })
          : dispatch({ type: "tool", tool: "select" }),
      editSelection: () => selected?.type === "text" && setEditTextId(selected.id),
      tool: (tool) => dispatch({ type: "tool", tool }),
    },
    isMac,
  );

  return (
    <div className="flex h-full flex-col text-neutral-900 dark:text-neutral-100">
      <Toolbar
        tool={state.tool}
        color={state.color}
        strokeWidth={state.strokeWidth}
        canUndo={state.history.past.length > 0}
        canRedo={state.history.future.length > 0}
        isMac={isMac}
        busy={busy || !source}
        scale={source?.scale ?? 1}
        dispatch={dispatch}
        onCopy={() => void copy()}
        onSave={() => void save()}
        onQuickSave={() => void quickSave()}
        onDragPointerDown={onDragPointerDown}
      />
      <div className="flex min-h-0 flex-1">
        {assets ? (
          <Stage
            state={state}
            assets={assets}
            dispatch={dispatch}
            editTextId={editTextId}
            onEditText={setEditTextId}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-neutral-200/70 text-[13px] text-neutral-500 dark:bg-neutral-950">
            {error ?? "Loading…"}
          </div>
        )}
        <Sidebar
          style={doc.style}
          systemWallpapers={systemWallpapers}
          customPreview={custom?.url ?? null}
          onStyle={(patch, key) => dispatch({ type: "style", patch, key })}
          onCommit={() => dispatch({ type: "seal" })}
          onReset={(section) => dispatch({ type: "resetSection", section })}
          onUpload={(file) => void upload(file)}
        />
      </div>
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 flex justify-center pr-72">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
          >
            <span className={toast.error ? "text-amber-300" : "text-emerald-400"}>
              {toast.error ? "!" : "✓"}
            </span>
            <span>{toast.message}</span>
            {toast.reveal && (
              <button
                type="button"
                onClick={() => void api.revealLastSave()}
                className="font-semibold text-blue-300 hover:text-blue-200"
              >
                Show in {isMac ? "Finder" : "Explorer"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
