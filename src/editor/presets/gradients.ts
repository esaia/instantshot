export interface GradientPreset {
  id: string;
  /** CSS-style angle: 0° points up, 90° to the right. */
  angle: number;
  stops: string[];
}

export const GRADIENTS: GradientPreset[] = [
  { id: "peach", angle: 135, stops: ["#f5576c", "#f8a170", "#fdd36a"] },
  { id: "lime", angle: 135, stops: ["#d4fc79", "#c2f3a6"] },
  { id: "plum", angle: 135, stops: ["#5b1a8f", "#6f2a92"] },
  { id: "sage", angle: 120, stops: ["#2e6f6a", "#9cc9b4", "#e0a23e"] },
  { id: "brass", angle: 90, stops: ["#a38a2c", "#e3a03c"] },
  { id: "meadow", angle: 90, stops: ["#64a35c", "#f6d860"] },
  { id: "abyss", angle: 135, stops: ["#0b2a6f", "#4ba3c7", "#7fd1cc"] },
  { id: "ink", angle: 120, stops: ["#0f1416", "#2c5364", "#6ec3d4"] },
  { id: "dusk", angle: 160, stops: ["#d7c3c0", "#5c74c5"] },
  { id: "orchid", angle: 110, stops: ["#d44fa6", "#6fcf6e"] },
  { id: "flame", angle: 90, stops: ["#e62e2e", "#87f541"] },
  { id: "berry", angle: 135, stops: ["#6d3fa0", "#cf2d2d"] },
  { id: "blush", angle: 135, stops: ["#f6cfc9", "#f2aaa5"] },
  { id: "lilac", angle: 160, stops: ["#ecc8f0", "#a59ad8"] },
  { id: "coral", angle: 90, stops: ["#f08a7c", "#ef977f", "#c55a6a"] },
  { id: "mint", angle: 135, stops: ["#9cf0c4", "#9ad6ed"] },
  { id: "sky", angle: 135, stops: ["#5ab8f8", "#69e6fd"] },
  { id: "sunset", angle: 180, stops: ["#1424a8", "#7a4fb0", "#f2a68d", "#fcc7a0"] },
  { id: "mango", angle: 120, stops: ["#f37fa3", "#f9d36e"] },
  { id: "night", angle: 180, stops: ["#2a1a5e", "#3c5c8d", "#72d1c4"] },
  { id: "candy", angle: 135, stops: ["#e46fd4", "#b471f0"] },
  { id: "rose", angle: 135, stops: ["#e8777f", "#f09597"] },
  { id: "steel", angle: 135, stops: ["#6a98e0", "#86b4ea"] },
  { id: "azure", angle: 135, stops: ["#3fb6f7", "#4b6cf9"] },
];

export const gradientById = (id: string) => GRADIENTS.find((g) => g.id === id);
