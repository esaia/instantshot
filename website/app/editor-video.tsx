"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The screenshot editor recording: muted and looping like a GIF, but only plays while on
 * screen. With reduced motion it doesn't autoplay and shows controls instead.
 */
export function EditorVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="media-frame">
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="metadata"
        controls={still}
        poster="/media/editor-demo.jpg?v=2"
        width={1600}
        height={924}
        aria-label="Selecting part of a page, drawing arrows on it, choosing a size and placing it on a wallpaper in the InstantShot editor"
      >
        <source src="/media/editor-demo.webm?v=2" type="video/webm" />
        <source src="/media/editor-demo.mp4?v=2" type="video/mp4" />
      </video>
    </div>
  );
}
