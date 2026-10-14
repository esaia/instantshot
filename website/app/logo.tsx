import { useId } from "react";

/** Guitar-pick silhouette (a nod to "Picker") with a text cursor. 64×64 grid. */
export const PICK_PATH =
  "M32 59.5c-1.4 0-2.6-.7-3.5-1.8C19.6 47.6 6 32.4 6 20.2 6 10.3 17 5 32 5s26 5.3 26 15.2c0 12.2-13.6 27.4-22.5 37.5-.9 1.1-2.1 1.8-3.5 1.8Z";
export const CURSOR_PATH = "M26.5 17h11M26.5 39h11M32 17v22";

export const PICK_COLOR = "#ade4fc";

/** Full-color mark: a flat sky-blue pick with a dark cursor. */
export function PickLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d={PICK_PATH} fill={PICK_COLOR} />
      <path
        d={CURSOR_PATH}
        fill="none"
        stroke="#0f1217"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One-color mark for menu bars: the cursor is cut out of the pick. */
export function PickGlyph({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="64" height="64" fill="#fff" />
          <path d={CURSOR_PATH} stroke="#000" strokeWidth="5" strokeLinecap="round" />
        </mask>
      </defs>
      <path d={PICK_PATH} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
