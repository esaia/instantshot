// Shortcut strings use the global-hotkey format understood by the Rust side,
// e.g. "Super+Shift+Digit2" (modifiers first, then a KeyboardEvent.code).

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

type KeyLike = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** Builds an accelerator from a keydown event, or null while only modifiers are held. */
export function fromKeyboardEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push("Super");
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.code);
  return parts.join("+");
}

const MAC_SYMBOLS: Record<string, string> = {
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Super: "⌘",
};
const WIN_NAMES: Record<string, string> = {
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Super: "Win",
};
const KEY_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: "Return",
  Escape: "Esc",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

// Display order matches platform conventions.
const MAC_ORDER = ["Control", "Alt", "Shift", "Super"];
const WIN_ORDER = ["Control", "Super", "Alt", "Shift"];

function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}

/** Human-readable shortcut, e.g. "⇧⌘2" on macOS or "Ctrl+Shift+2" on Windows. */
export function formatShortcut(accelerator: string, platform: string): string {
  const parts = accelerator.split("+").filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => normalizeModifier(p)));
  if (platform === "macos") {
    return MAC_ORDER.filter((m) => mods.has(m))
      .map((m) => MAC_SYMBOLS[m])
      .concat(keyName(key))
      .join("");
  }
  return WIN_ORDER.filter((m) => mods.has(m))
    .map((m) => WIN_NAMES[m])
    .concat(keyName(key))
    .join("+");
}

function normalizeModifier(m: string): string {
  switch (m.toLowerCase()) {
    case "cmd":
    case "command":
    case "meta":
    case "super":
      return "Super";
    case "ctrl":
    case "control":
      return "Control";
    case "alt":
    case "option":
      return "Alt";
    case "shift":
      return "Shift";
    default:
      return m;
  }
}
