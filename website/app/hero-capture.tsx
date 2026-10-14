"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The hero demonstrates both features on itself, alternating:
 * 1. Screenshot: the page dims, a crosshair selects the hero, "Edit" is clicked, and the
 *    captured hero becomes a framed screenshot on cycling wallpapers.
 * 2. Text: a crosshair selects the headline (the `.hc-target` element in the children), the
 *    "Copied" HUD appears, and ⌘V pastes the headline into a search bar as plain text.
 *
 * The whole sequence is one CSS keyframe timeline (see "Hero capture animation" in
 * globals.css), so it plays without any JavaScript; script only measures the size label.
 * Content stays readable and clickable throughout; reduced motion turns it off.
 */
export function HeroCapture({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState("1600 × 1180");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      setSize(`${Math.round((r.width + 28) * dpr)} × ${Math.round((r.height + 28) * dpr)}`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={root} className="hc">
      <div className="hc-bgs" aria-hidden="true">
        <div className="hc-bg hc-bg-tide" />
        <div className="hc-bg hc-bg-sunset" />
        <div className="hc-bg hc-bg-candy" />
      </div>

      <div className="hc-shot">{children}</div>

      <div className="hc-fx" aria-hidden="true">
        <div className="hc-hole">
          <span className="hc-size">{size}</span>
        </div>
        <div className="hc-keys">
          <kbd>⇧</kbd>
          <kbd>⌘</kbd>
          <kbd>1</kbd>
        </div>
        <div className="hc-bar">
          <span className="hc-bar-copy">Copy ↵</span>
          <span className="hc-bar-edit">✎ Edit</span>
          <span className="hc-bar-x">✕</span>
        </div>
        <span className="hc-toast">✓ Copied to clipboard</span>

        <div className="hc-keys-text">
          <kbd>⇧</kbd>
          <kbd>⌘</kbd>
          <kbd>2</kbd>
        </div>
        <span className="hc-copied">
          <b>✓</b> Copied 39 characters
        </span>
        <div className="hc-paste">
          <svg viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span className="hc-paste-text">
            <span className="hc-paste-empty">
              <span>Search</span>
            </span>
            <span className="hc-paste-full">Snip anything. Copy any text on screen.</span>
          </span>
          <kbd className="hc-paste-kbd">⌘V</kbd>
        </div>
        <svg className="hc-cross" viewBox="0 0 24 24">
          <path d="M12 2v20M2 12h20" />
        </svg>
        <svg className="hc-arrow" viewBox="0 0 24 24">
          <path d="M5 3l14 8-6.5 1.6L9.6 19z" />
        </svg>
      </div>
    </div>
  );
}
