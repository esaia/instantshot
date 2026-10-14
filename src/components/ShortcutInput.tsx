import { useEffect, useState } from "react";
import { formatShortcut, fromKeyboardEvent } from "../lib/shortcut";
import { api } from "../lib/tauri";

interface Props {
  value: string;
  platform: string;
  /** Resolves to an error message, or null when the shortcut was registered. */
  onChange: (accelerator: string) => Promise<string | null>;
  label?: string;
}

/** Click to record a new global shortcut. Escape cancels; the old shortcut stays active. */
export function ShortcutInput({ value, platform, onChange, label = "Capture shortcut" }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    // Don't trigger a capture while the user presses the current shortcut here.
    void api.setShortcutPaused(true);
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setRecording(false);
        return;
      }
      const accelerator = fromKeyboardEvent(e);
      if (!accelerator) return;
      setRecording(false);
      setError(await onChange(accelerator));
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      void api.setShortcutPaused(false);
    };
  }, [recording, onChange]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setRecording((r) => !r);
        }}
        onBlur={() => setRecording(false)}
        aria-label={label}
        className={`h-7 min-w-28 rounded-md px-3 text-[13px] font-medium tabular-nums shadow-sm ring-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
          recording
            ? "bg-blue-50 text-blue-600 ring-blue-400 dark:bg-blue-500/15 dark:text-blue-300"
            : "bg-white ring-black/10 dark:bg-neutral-700 dark:ring-white/10"
        }`}
      >
        {recording ? "Press shortcut…" : formatShortcut(value, platform)}
      </button>
      {error && (
        <p role="alert" className="max-w-56 text-right text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
