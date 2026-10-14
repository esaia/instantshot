/** Generated "mesh" wallpapers: a base color with large soft color fields, drawn from a seed. */
export interface WallpaperPreset {
  id: string;
  name: string;
  base: string;
  palette: string[];
  seed: number;
}

export const WALLPAPERS: WallpaperPreset[] = [
  {
    id: "tide",
    name: "Tide",
    base: "#1d3fa8",
    palette: ["#9cc3f5", "#3a7de0", "#e6eefb", "#0d2a7a"],
    seed: 11,
  },
  {
    id: "midnight",
    name: "Midnight",
    base: "#0b0f3a",
    palette: ["#3a2fbf", "#1b5ad6", "#7d4de0", "#05061a"],
    seed: 23,
  },
  {
    id: "graphite",
    name: "Graphite",
    base: "#050505",
    palette: ["#3b3b3b", "#1a1a1a", "#626262", "#000000"],
    seed: 37,
  },
  {
    id: "sonora",
    name: "Sonora",
    base: "#e8573f",
    palette: ["#f4a35d", "#2f9a8f", "#f6d36f", "#c43a5a"],
    seed: 41,
  },
  {
    id: "prism",
    name: "Prism",
    base: "#2e9e8f",
    palette: ["#f25c78", "#f7c35c", "#e9497f", "#41c7b9"],
    seed: 53,
  },
  {
    id: "aurora",
    name: "Aurora",
    base: "#2a3fbf",
    palette: ["#58e0d0", "#8fd16a", "#4058e8", "#b8f0ff"],
    seed: 67,
  },
  {
    id: "ember",
    name: "Ember",
    base: "#3f5ad8",
    palette: ["#f08d5a", "#e85d75", "#ffd2a8", "#8a5ad8"],
    seed: 71,
  },
  {
    id: "marigold",
    name: "Marigold",
    base: "#f59b23",
    palette: ["#ffd06b", "#ef6a1f", "#4a6ee0", "#ffe7a8"],
    seed: 83,
  },
  {
    id: "fog",
    name: "Fog",
    base: "#5d7387",
    palette: ["#e8dccb", "#2d3d4f", "#a5b7c7", "#f3ead9"],
    seed: 97,
  },
  {
    id: "meadow",
    name: "Meadow",
    base: "#3fa34d",
    palette: ["#9be15d", "#6b4fd8", "#e0e85a", "#1f6f3a"],
    seed: 101,
  },
  {
    id: "pine",
    name: "Pine",
    base: "#14261f",
    palette: ["#3f8f5a", "#6f5ad8", "#1f3f30", "#8fd16a"],
    seed: 113,
  },
  {
    id: "glacier",
    name: "Glacier",
    base: "#cfe3f7",
    palette: ["#9fc2f0", "#ffffff", "#7ba6e8", "#e8d8f5"],
    seed: 127,
  },
  {
    id: "lagoon",
    name: "Lagoon",
    base: "#1f4fd1",
    palette: ["#4fc3f7", "#7b4fe8", "#2a2fa8", "#9ee8ff"],
    seed: 131,
  },
  {
    id: "bloom",
    name: "Bloom",
    base: "#4ad1e8",
    palette: ["#f2627b", "#f8a65d", "#7b5af0", "#ffd36b"],
    seed: 149,
  },
  {
    id: "crimson",
    name: "Crimson",
    base: "#c41f3a",
    palette: ["#f2627b", "#6b1fa8", "#ff9f7a", "#3a0f5a"],
    seed: 157,
  },
  {
    id: "dune",
    name: "Dune",
    base: "#2a1458",
    palette: ["#d8456a", "#7b2fa8", "#f2895a", "#120a2a"],
    seed: 163,
  },
];

export const wallpaperById = (id: string) => WALLPAPERS.find((w) => w.id === id);
