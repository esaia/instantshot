import { useEffect, useRef } from "react";
import type { Tool } from "./model/types";

export interface KeyboardActions {
  copy: () => void;
  save: () => void;
  quickSave: () => void;
  undo: () => void;
  redo: () => void;
  close: () => void;
  deleteSelection: () => void;
  escape: () => void;
  editSelection: () => void;
  tool: (tool: Tool) => void;
}

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  d: "pen",
  a: "arrow",
  r: "rect",
  o: "ellipse",
  t: "text",
  b: "blur",
  p: "pixelate",
};

const NON_TEXT_INPUTS = new Set(["range", "color", "checkbox", "radio", "button", "file"]);

/** True while the user is typing somewhere, so shortcuts must not fire. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/**
 * Editor shortcuts (⌘ on macOS, Ctrl elsewhere). Copy is also handled through the DOM `copy`
 * event, because the native Edit menu may claim ⌘C before the page sees the key.
 */
export function useEditorKeyboard(actions: KeyboardActions, isMac: boolean) {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    let lastCopy = 0;
    const copyOnce = () => {
      const now = performance.now();
      if (now - lastCopy < 300) return;
      lastCopy = now;
      latest.current.copy();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.isComposing) return;
      const a = latest.current;
      const key = e.key.toLowerCase();
      if (isMac ? e.metaKey : e.ctrlKey) {
        if (key === "c" && !e.shiftKey) copyOnce();
        else if (key === "s") (e.shiftKey ? a.quickSave : a.save)();
        else if (key === "z") (e.shiftKey ? a.redo : a.undo)();
        else if (key === "y" && !isMac) a.redo();
        else if (key === "w") a.close();
        else return;
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (key === "backspace" || key === "delete") a.deleteSelection();
      else if (key === "escape") a.escape();
      else if (key === "enter") a.editSelection();
      else if (TOOL_KEYS[key] && !e.shiftKey) a.tool(TOOL_KEYS[key]);
      else return;
      e.preventDefault();
    };

    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || window.getSelection()?.toString()) return;
      e.preventDefault();
      copyOnce();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
    };
  }, [isMac]);
}
