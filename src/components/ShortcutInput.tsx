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

const MAC_MODIFIERS = "⌃⌥⇧⌘";

/** Splits a formatted shortcut into keys: "⇧⌘2" → ⇧ ⌘ 2, "Ctrl+Shift+2" → Ctrl Shift 2. */
function shortcutKeys(accelerator: string, platform: string): string[] {
  const text = formatShortcut(accelerator, platform);
  if (platform !== "macos") return text.split("+").filter(Boolean);
  const keys: string[] = [];
  let i = 0;
  while (i < text.length && MAC_MODIFIERS.includes(text[i])) keys.push(text[i++]);
  if (i < text.length) keys.push(text.slice(i));
  return keys;
}

/** A shortcut drawn as individual keycaps. */
export function Keys({
  accelerator,
  platform,
  size = "md",
}: {
  accelerator: string;
  platform: string;
  size?: "sm" | "md";
}) {
  const cap =
    size === "sm"
      ? "h-[18px] min-w-[18px] rounded-[4px] px-1 text-[11px]"
      : "h-[20px] min-w-[20px] rounded-[5px] px-1.5 text-[12px]";
  return (
    <span className="inline-flex items-center gap-[3px] align-middle">
      {shortcutKeys(accelerator, platform).map((key, i) => (
        <kbd
          // biome-ignore lint/suspicious/noArrayIndexKey: keys of one shortcut never reorder
          key={i}
          className={`inline-flex items-center justify-center bg-white font-sans font-medium tabular-nums text-neutral-700 shadow-[0_1px_0_rgb(0_0_0/0.12),inset_0_0_0_0.5px_rgb(0_0_0/0.12)] dark:bg-white/[0.12] dark:text-neutral-100 dark:shadow-[0_1px_0_rgb(0_0_0/0.4),inset_0_0_0_0.5px_rgb(255_255_255/0.1)] ${cap}`}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
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
        title={recording ? "Press the new shortcut, or Esc to cancel" : "Click to change"}
        className={`flex h-[28px] min-w-[92px] items-center justify-center rounded-[8px] px-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
          recording
            ? "bg-[#007aff]/10 text-[12px] font-medium text-[#007aff] ring-[1.5px] ring-[#007aff] dark:bg-[#0a84ff]/15 dark:text-[#4da3ff] dark:ring-[#0a84ff]"
            : "bg-black/[0.04] ring-1 ring-black/[0.06] hover:bg-black/[0.07] dark:bg-white/[0.06] dark:ring-white/[0.08] dark:hover:bg-white/[0.1]"
        }`}
      >
        {recording ? (
          <span className="flex items-center gap-1.5 px-1">
            <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
            Type shortcut
          </span>
        ) : (
          <Keys accelerator={value} platform={platform} />
        )}
      </button>
      {error && (
        <p
          role="alert"
          className="max-w-56 text-right text-[11.5px] text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
