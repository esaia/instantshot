"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PickGlyph } from "./logo";

/**
 * A miniature Mac desktop that behaves like TextPicker: press the shortcut (or drag on the
 * post or the scanned PDF), select a region, and the words inside really land on the
 * clipboard. The Spotlight-style bar is a real input, so ⌘V pastes them back.
 */

type Mode = "idle" | "selecting" | "copied" | "pasted";
type Source = "post" | "pdf";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rectOf = (b: Box) => ({
  left: Math.min(b.x0, b.x1),
  top: Math.min(b.y0, b.y1),
  width: Math.abs(b.x1 - b.x0),
  height: Math.abs(b.y1 - b.y0),
});

/** Renders text as individually positioned words that the selection can collect. */
function Words({ line, text }: { line: string; text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span key={`${line}-${i}`} data-word data-line={line}>
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function useClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const tick = () => setNow(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Lights() {
  return (
    <span className="lights" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function DesktopDemo() {
  const screenRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<{ text: string; ok: boolean; source: Source } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isMac, setIsMac] = useState(true);
  const [isTouch, setIsTouch] = useState(false);
  const clock = useClock();

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const shortcut = isMac ? "⇧⌘2" : "Ctrl+Shift+2";
  const paste = isMac ? "⌘V" : "Ctrl+V";

  const start = useCallback(() => {
    setBox(null);
    setDragging(false);
    setMode("selecting");
  }, []);

  const cancel = useCallback(() => {
    setBox(null);
    setDragging(false);
    setMode((m) => (m === "selecting" ? "idle" : m));
  }, []);

  // The real shortcut works anywhere on the page; Esc cancels like in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Digit2") {
        e.preventDefault();
        start();
      } else if (e.key === "Escape") {
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, cancel]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [toast]);

  /** Words whose center lies inside the selection, grouped into lines in reading order. */
  const collect = useCallback((b: Box): { text: string; source: Source } => {
    const screen = screenRef.current;
    if (!screen) return { text: "", source: "post" };
    const origin = screen.getBoundingClientRect();
    const r = rectOf(b);
    const lines = new Map<string, { top: number; words: { left: number; text: string }[] }>();
    let source: Source = "post";
    for (const el of screen.querySelectorAll<HTMLElement>("[data-word]")) {
      const w = el.getBoundingClientRect();
      const cx = w.left + w.width / 2 - origin.left;
      const cy = w.top + w.height / 2 - origin.top;
      if (cx < r.left || cx > r.left + r.width || cy < r.top || cy > r.top + r.height) continue;
      const key = el.dataset.line ?? "";
      if (el.closest("[data-source='pdf']")) source = "pdf";
      const entry = lines.get(key) ?? { top: w.top, words: [] };
      entry.words.push({ left: w.left, text: (el.textContent ?? "").trim() });
      lines.set(key, entry);
    }
    const text = [...lines.values()]
      .sort((a, b) => a.top - b.top)
      .map((l) =>
        l.words
          .sort((a, b) => a.left - b.left)
          .map((w) => w.text)
          .join(" "),
      )
      .join("\n");
    return { text, source };
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = screenRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
      y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
    };
  };

  const beginDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    screenRef.current?.setPointerCapture(e.pointerId);
    const p = point(e);
    setMode("selecting");
    setDragging(true);
    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const p = point(e);
    setBox((b) => (b ? { ...b, x1: p.x, y1: p.y } : b));
  };

  const onPointerUp = async () => {
    if (!dragging || !box) return;
    setDragging(false);
    const r = rectOf(box);
    if (r.width < 6 || r.height < 6) {
      setBox(null);
      return;
    }
    const { text, source } = collect(box);
    setBox(null);
    if (!text) {
      setMode("idle");
      setToast("No text found");
      return;
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    setCopied({ text, ok, source });
    setMode("copied");
    setToast(`Copied ${text.length} characters`);
    inputRef.current?.focus({ preventScroll: true });
  };

  const onDraftChange = (raw: string) => {
    // A search field is one line: pasted line breaks become spaces.
    const value = raw.replace(/\s*\n\s*/g, " ");
    setDraft(value);
    if (copied && value.includes(copied.text.split("\n")[0].trim())) setMode("pasted");
  };

  const pasteFallback = () => {
    if (!copied) return;
    onDraftChange(copied.text);
    inputRef.current?.focus({ preventScroll: true });
  };

  const r = box ? rectOf(box) : null;

  const other = copied?.source === "pdf" ? "the post" : "the PDF";
  const caption =
    mode === "selecting"
      ? "Drag over any text on the screen. Press Esc to cancel."
      : mode === "copied"
        ? copied?.ok
          ? `It’s on your clipboard. Press ${paste} in the search bar.`
          : "Your browser blocked the clipboard. Use Paste in the search bar."
        : mode === "pasted"
          ? `That’s the whole app. Now try ${other}.`
          : null;

  return (
    <figure className="demo">
      <div className="device">
        {/* Pointer surface for the selection; keyboard users press the shortcut instead. */}
        <div
          ref={screenRef}
          className="screen"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancel}
        >
          <div className="menubar" aria-hidden="true">
            <svg className="menubar-apple" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M16.37 12.73c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.29-3.52ZM14.2 6.27c.6-.73 1.01-1.75.9-2.77-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.21Z"
              />
            </svg>
            <strong>Finder</strong>
            <span>File</span>
            <span>Edit</span>
            <span>View</span>
            <span className="menubar-right">
              <PickGlyph className="menubar-app" />
              <span>{clock}</span>
            </span>
          </div>

          {/* A screenshot of a post on the desktop: its text is pixels, so it can't be
              selected the normal way. */}
          <div className="shot" onPointerDown={beginDrag}>
            <article className="tweet" aria-label="Screenshot of a post on X">
                <header className="tweet-head">
                  <img className="tweet-avatar" src="/esaia-avatar.jpg" alt="" draggable={false} />
                  <span className="tweet-who">
                    <strong>
                      <Words line="t0" text="Esaia" />
                    </strong>
                    <span className="tweet-handle">
                      <Words line="t0" text="@esaia__" />
                    </span>
                  </span>
                  <svg className="tweet-x" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.57l11.1 14.43Z"
                    />
                  </svg>
                </header>
                <p className="tweet-text">
                  <Words line="t1" text="Text in screenshots shouldn’t" />
                  <br />
                  <Words line="t2" text="be a dead end." />
                </p>
                <p className="tweet-text">
                  <Words line="t3" text="Press ⇧⌘2, drag, paste." />
                  <br />
                  <Words line="t4" text="That’s TextPicker." />
                </p>
                <p className="tweet-meta">
                  <Words line="t5" text="3:19 PM · Oct 13, 2026 · 2.4K Views" />
                </p>
                <footer className="tweet-actions" aria-hidden="true">
                  <span>
                    <svg viewBox="0 0 24 24">
                      <path d="M4 12a8 7 0 1 1 3.5 5.8L4 19l1.2-3.3A6.8 6.8 0 0 1 4 12Z" />
                    </svg>
                    18
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24">
                      <path d="M7 4 4 7l3 3M4 7h11a4 4 0 0 1 4 4v1M17 20l3-3-3-3M20 17H9a4 4 0 0 1-4-4v-1" />
                    </svg>
                    42
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24">
                      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
                    </svg>
                    310
                  </span>
                </footer>
            </article>
          </div>

          <section className="win win-pdf" aria-label="Preview: scan.pdf">
            <div className="win-bar">
              <Lights />
              <span className="win-title">scan.pdf</span>
            </div>
            {/* A scanned page: the text is part of the image, so it can't be selected. */}
            <div className="pdf-canvas" data-source="pdf" onPointerDown={beginDrag}>
              <div className="page">
                <p className="page-title">
                  <Words line="d0" text="On Small Tools" />
                </p>
                <p className="page-label">
                  <Words line="d1" text="Abstract" />
                </p>
                <p className="page-body">
                  <Words line="d2" text="Small tools that remove a single" />
                  <br />
                  <Words line="d3" text="step from a common task are" />
                  <br />
                  <Words line="d4" text="used far more often than large" />
                  <br />
                  <Words line="d5" text="ones that promise everything." />
                </p>
                <div className="page-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="page-foot">
                  <Words line="d6" text="Page 1 of 12" />
                </p>
              </div>
            </div>
          </section>

          <form
            className={`spotlight${mode === "copied" ? " is-ready" : ""}`}
            onSubmit={(e) => e.preventDefault()}
          >
            <svg className="spotlight-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Spotlight Search"
              aria-label="Search bar: paste the copied text here"
              spellCheck={false}
            />
            {copied && (isTouch || !copied.ok) ? (
              <button type="button" className="spotlight-paste" onClick={pasteFallback}>
                Paste
              </button>
            ) : (
              <kbd className="spotlight-hint">{paste}</kbd>
            )}
          </form>

          {mode === "selecting" && (
            <div className="overlay" onPointerDown={beginDrag} aria-hidden="true">
              {r ? (
                <div
                  className="overlay-hole"
                  style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                />
              ) : (
                <div className="overlay-dim" />
              )}
            </div>
          )}

          {toast && (
            <output className="hud" aria-live="polite">
              {toast}
            </output>
          )}
        </div>
      </div>

      <figcaption className="demo-caption">
        {caption ??
          (isTouch ? (
            "Try it here: drag over the post or the PDF, then tap Paste."
          ) : (
            <>
              Try it here: press{" "}
              <button type="button" className="keycap" onClick={start}>
                {shortcut}
              </button>{" "}
              and drag over the post or the PDF.
            </>
          ))}
      </figcaption>
    </figure>
  );
}
