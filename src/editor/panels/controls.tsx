import type { ReactNode } from "react";

export function PanelSection({
  title,
  onReset,
  children,
}: {
  title: string;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-black/5 px-4 py-4 last:border-b-0 dark:border-white/5">
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-[12px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400"
          >
            Reset
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(Math.round(v)),
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[12px] text-neutral-600 dark:text-neutral-300">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-400">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className="mt-1 w-full accent-blue-500"
      />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: { id: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-white/5"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          className="flex h-7 items-center justify-center rounded-md text-[12px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 aria-pressed:bg-white aria-pressed:text-neutral-900 aria-pressed:shadow-sm dark:text-neutral-400 dark:hover:text-neutral-100 dark:aria-pressed:bg-neutral-600 dark:aria-pressed:text-white"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A square background preview tile. */
export function Swatch({
  selected,
  title,
  onClick,
  style,
  children,
}: {
  selected: boolean;
  title: string;
  onClick: () => void;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      style={style}
      className={`relative aspect-square overflow-hidden rounded-[10px] bg-cover bg-center ring-1 ring-black/10 transition-shadow dark:ring-white/10 ${
        selected
          ? "outline-2 outline-offset-2 outline-blue-500"
          : "hover:outline-2 hover:outline-offset-2 hover:outline-black/15 dark:hover:outline-white/20"
      }`}
    >
      {children}
    </button>
  );
}

/** CSS for a checkerboard (transparent background preview). */
export const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#d4d4d4 25%,transparent 25%),linear-gradient(-45deg,#d4d4d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d4 75%),linear-gradient(-45deg,transparent 75%,#d4d4d4 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
};
