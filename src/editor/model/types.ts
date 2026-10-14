// Editor document model. Style sizes are logical px (multiplied by the capture's scale when
// rendering); annotation geometry is in source-image pixels so it stays attached to the
// screenshot when padding or aspect change.

export type Background =
  /** Generated mesh wallpaper (see wallpapers/presets.ts). */
  | { kind: "wallpaper"; id: string }
  /** A desktop picture installed on this Mac. */
  | { kind: "system"; id: string }
  /** An uploaded image; lives only for the current session. */
  | { kind: "custom" }
  | { kind: "solid"; color: string }
  | { kind: "gradient"; id: string }
  | { kind: "none" };

export type AspectId = "auto" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16" | "4:5";
export type ChromeId = "none" | "light" | "dark";

/** Share of the screenshot trimmed from each edge, 0–1. */
export interface Crop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface EditorStyle {
  background: Background;
  padding: number;
  inset: number;
  radius: number;
  shadow: number;
  shadowOpacity: number;
  /** Blur applied to image and gradient backgrounds, logical px. */
  backgroundBlur: number;
  chrome: ChromeId;
  aspect: AspectId;
  /** Per screenshot: never restored from storage, cleared for each new capture. */
  crop: Crop;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Base {
  id: string;
  color: string;
  /** Stroke width in source pixels. */
  width: number;
}

interface Rotatable {
  /** Clockwise rotation around the box center, radians (0 when absent). */
  rotation?: number;
}

export type ArrowAnnotation = Base & { type: "arrow"; from: Point; to: Point };
export type BoxAnnotation = Base &
  Box &
  Rotatable & { type: "rect" | "ellipse" | "blur" | "pixelate" };
export type TextAnnotation = Base &
  Box &
  Rotatable & {
    type: "text";
    text: string;
    /** Font size in source pixels. `w`/`h` are the measured bounds. */
    size: number;
    /** Horizontal stretch of the glyphs (1 = natural width). */
    scaleX?: number;
  };
export type Annotation = ArrowAnnotation | BoxAnnotation | TextAnnotation;
export type AnnotationType = Annotation["type"];

export type Tool = "select" | AnnotationType;

export interface Doc {
  style: EditorStyle;
  annotations: Annotation[];
}

/** The captured screenshot plus what the renderer derives from its pixels once. */
export interface SourceImage {
  /** Pixel size. */
  width: number;
  height: number;
  /** Pixels per logical unit of the captured display. */
  scale: number;
  bitmap: CanvasImageSource;
  /** Dominant border color, used to fill the inset. */
  edgeColor: string;
}
