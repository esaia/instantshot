import { NO_CROP, resetSection, type Section } from "./defaults";
import { apply, createHistory, type History, redo, seal, undo } from "./history";
import type { Annotation, Doc, EditorStyle, Tool } from "./types";

export const STROKE_WIDTHS = [3, 5, 8] as const;
export const INK_COLORS = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#0a84ff",
  "#ffffff",
  "#111111",
];

export interface EditorState {
  history: History<Doc>;
  tool: Tool;
  selectedId: string | null;
  color: string;
  /** Logical px; multiplied by the capture scale for new annotations. */
  strokeWidth: number;
}

export type EditorAction =
  | { type: "load"; style: EditorStyle; annotations?: Annotation[] }
  | { type: "style"; patch: Partial<EditorStyle>; key?: string }
  | { type: "resetSection"; section: Section }
  | { type: "add"; annotation: Annotation }
  | { type: "update"; annotation: Annotation; key?: string }
  | { type: "delete"; id: string }
  | { type: "seal" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "tool"; tool: Tool }
  | { type: "select"; id: string | null }
  | { type: "color"; color: string }
  | { type: "strokeWidth"; width: number; scale: number };

export function initialEditorState(
  style: EditorStyle,
  annotations: Annotation[] = [],
): EditorState {
  return {
    history: createHistory({ style, annotations }),
    tool: "select",
    selectedId: null,
    color: INK_COLORS[0],
    strokeWidth: STROKE_WIDTHS[1],
  };
}

function withDoc(state: EditorState, doc: Doc, key?: string): EditorState {
  return { ...state, history: apply(state.history, doc, key ?? null) };
}

/** Clears the selection if the selected annotation no longer exists. */
function validSelection(state: EditorState): EditorState {
  const { selectedId } = state;
  if (selectedId && !state.history.present.annotations.some((a) => a.id === selectedId)) {
    return { ...state, selectedId: null };
  }
  return state;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const doc = state.history.present;
  const selected = doc.annotations.find((a) => a.id === state.selectedId) ?? null;
  switch (action.type) {
    case "load":
      return {
        // A new screenshot starts uncropped.
        ...initialEditorState({ ...action.style, crop: NO_CROP }, action.annotations),
        color: state.color,
        strokeWidth: state.strokeWidth,
      };
    case "style":
      return withDoc(state, { ...doc, style: { ...doc.style, ...action.patch } }, action.key);
    case "resetSection":
      return withDoc(state, { ...doc, style: resetSection(doc.style, action.section) });
    case "add":
      return {
        ...withDoc(state, { ...doc, annotations: [...doc.annotations, action.annotation] }),
        selectedId: action.annotation.id,
      };
    case "update":
      return withDoc(
        state,
        {
          ...doc,
          annotations: doc.annotations.map((a) =>
            a.id === action.annotation.id ? action.annotation : a,
          ),
        },
        action.key,
      );
    case "delete":
      return validSelection(
        withDoc(state, { ...doc, annotations: doc.annotations.filter((a) => a.id !== action.id) }),
      );
    case "seal":
      return { ...state, history: seal(state.history) };
    case "undo":
      return validSelection({ ...state, history: undo(state.history) });
    case "redo":
      return validSelection({ ...state, history: redo(state.history) });
    case "tool":
      return {
        ...state,
        tool: action.tool,
        selectedId: action.tool === "select" ? state.selectedId : null,
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "color": {
      const next = { ...state, color: action.color };
      return selected && selected.type !== "blur" && selected.type !== "pixelate"
        ? withDoc(next, {
            ...doc,
            annotations: doc.annotations.map((a) =>
              a.id === selected.id ? { ...a, color: action.color } : a,
            ),
          })
        : next;
    }
    case "strokeWidth": {
      const next = { ...state, strokeWidth: action.width };
      if (!selected || selected.type === "blur" || selected.type === "pixelate") return next;
      const width = action.width * action.scale;
      let updated: Annotation = { ...selected, width };
      if (selected.type === "text") {
        // Text metrics scale linearly with the font size.
        const size = textSize(action.width) * action.scale;
        const f = size / selected.size;
        updated = { ...selected, width, size, w: selected.w * f, h: selected.h * f };
      }
      return withDoc(next, {
        ...doc,
        annotations: doc.annotations.map((a) => (a.id === selected.id ? updated : a)),
      });
    }
  }
}

/** Text size (logical px) for a stroke width preset. */
export function textSize(strokeWidth: number): number {
  return strokeWidth <= STROKE_WIDTHS[0] ? 16 : strokeWidth <= STROKE_WIDTHS[1] ? 22 : 32;
}

let nextId = 0;
export const newId = () => `a${Date.now().toString(36)}${(nextId++).toString(36)}`;
