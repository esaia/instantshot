import type { Box } from "../model/types";

export const CHROME_COLORS = {
  light: { bar: "#ececec", line: "rgba(0,0,0,0.08)" },
  dark: { bar: "#2b2b2d", line: "rgba(255,255,255,0.08)" },
} as const;

const LIGHTS = ["#ff5f57", "#febc2e", "#28c840"];

/** macOS-style title bar with traffic lights across the top of `frame` (logical px). */
export function drawChrome(
  ctx: CanvasRenderingContext2D,
  frame: Box,
  height: number,
  theme: "light" | "dark",
): void {
  const colors = CHROME_COLORS[theme];
  ctx.fillStyle = colors.bar;
  ctx.fillRect(frame.x, frame.y, frame.w, height);
  ctx.fillStyle = colors.line;
  ctx.fillRect(frame.x, frame.y + height - 0.5, frame.w, 0.5);
  LIGHTS.forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(frame.x + 14 + i * 20, frame.y + height / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}
