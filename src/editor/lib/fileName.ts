const pad = (n: number) => String(n).padStart(2, "0");

/** "InstantShot 2026-10-14 at 15.04.12.png", like macOS screenshots. */
export function screenshotFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  return `InstantShot ${day} at ${time}.png`;
}
