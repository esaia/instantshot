import { useEffect, useRef, useState } from "react";
import { font, LINE_HEIGHT } from "../render/annotations";

export interface TextDraft {
  /** Existing annotation being edited, if any. */
  id: string | null;
  text: string;
  color: string;
  /** Font size in view (CSS) px. */
  fontSize: number;
  /** Position in view px, relative to the canvas. */
  x: number;
  y: number;
}

/** In-place text input over the canvas. Enter commits, Shift+Enter adds a line, Esc cancels. */
export function TextEditor({
  draft,
  onCommit,
  onCancel,
}: {
  draft: TextDraft;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(draft.text);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(text);
    else onCancel();
  };

  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return (
    <textarea
      ref={ref}
      value={text}
      wrap="off"
      spellCheck={false}
      rows={lines.length}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(false);
        else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        }
      }}
      style={{
        left: draft.x,
        top: draft.y,
        font: font(draft.fontSize),
        lineHeight: LINE_HEIGHT,
        color: draft.color,
        width: `calc(${longest}ch + ${draft.fontSize}px)`,
        caretColor: draft.color,
      }}
      className="absolute z-10 resize-none overflow-hidden whitespace-pre rounded-sm border-0 bg-black/5 p-0 outline-1 outline-offset-2 outline-blue-500 outline-dashed dark:bg-white/10"
    />
  );
}
