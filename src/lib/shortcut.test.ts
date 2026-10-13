import { describe, expect, it } from "vitest";
import { formatShortcut, fromKeyboardEvent } from "./shortcut";

const key = (
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) => ({
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("fromKeyboardEvent", () => {
  it("ignores modifier-only presses", () => {
    expect(fromKeyboardEvent(key("ShiftLeft", { shift: true }))).toBeNull();
    expect(fromKeyboardEvent(key("MetaRight", { meta: true }))).toBeNull();
  });

  it("builds accelerators in a stable modifier order", () => {
    expect(fromKeyboardEvent(key("Digit2", { meta: true, shift: true }))).toBe(
      "Super+Shift+Digit2",
    );
    expect(fromKeyboardEvent(key("KeyT", { ctrl: true, alt: true }))).toBe("Control+Alt+KeyT");
  });
});

describe("formatShortcut", () => {
  it("uses symbols on macOS", () => {
    expect(formatShortcut("Super+Shift+Digit2", "macos")).toBe("⇧⌘2");
    expect(formatShortcut("Control+Alt+KeyT", "macos")).toBe("⌃⌥T");
  });

  it("uses names on Windows", () => {
    expect(formatShortcut("Control+Shift+Digit2", "windows")).toBe("Ctrl+Shift+2");
    expect(formatShortcut("Alt+Space", "windows")).toBe("Alt+Space");
  });
});
