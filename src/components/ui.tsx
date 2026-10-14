import type { ReactNode } from "react";

/** Grouped card in the style of macOS System Settings, with an optional footnote below. */
export function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1.5 px-3 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[10px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-black/[0.06] dark:bg-white/[0.045] dark:shadow-none dark:ring-white/[0.07]">
        {children}
      </div>
      {footer && (
        <p className="mt-1.5 px-3 text-[11.5px] leading-4 text-neutral-500 dark:text-neutral-400">
          {footer}
        </p>
      )}
    </section>
  );
}

const TINTS = {
  blue: "from-sky-400 to-blue-500",
  indigo: "from-indigo-400 to-indigo-600",
  purple: "from-fuchsia-400 to-purple-600",
  green: "from-emerald-400 to-green-600",
  orange: "from-amber-400 to-orange-500",
  red: "from-rose-400 to-red-500",
  teal: "from-teal-300 to-cyan-600",
  gray: "from-neutral-400 to-neutral-500 dark:from-neutral-500 dark:to-neutral-600",
} as const;

export type Tint = keyof typeof TINTS;

/** Small tinted glyph tile that leads a row. `children` is a 16×16 stroked path. */
export function RowIcon({ tint, children }: { tint: Tint; children: ReactNode }) {
  return (
    <span
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-b text-white shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.25)] ${TINTS[tint]}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-[13px]"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

/**
 * One line of a section. The hairline separator starts after the icon, like System Settings,
 * and is dropped on the section's first row.
 */
export function Row({
  label,
  hint,
  icon,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="group/row flex items-center gap-3 pl-3">
      {icon}
      <div className="flex min-h-[46px] min-w-0 flex-1 items-center justify-between gap-4 border-t border-black/[0.06] py-2 pr-3 group-first/row:border-t-0 dark:border-white/[0.06]">
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="block text-[13px] leading-[18px]">
            {label}
          </label>
          {hint && (
            <div className="mt-px text-[11.5px] leading-[15px] text-neutral-500 dark:text-neutral-400">
              {hint}
            </div>
          )}
        </div>
        {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
      </div>
    </div>
  );
}

export function Toggle({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 ${
        checked
          ? "bg-[#007aff] dark:bg-[#0a84ff]"
          : "bg-black/[0.12] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-white/[0.16]"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.04)] transition-transform duration-200 ease-[cubic-bezier(0.3,1.3,0.5,1)] ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  title?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-[#007aff] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.15)] hover:bg-[#0a6fe6] active:bg-[#0062cc] dark:bg-[#0a84ff] dark:hover:bg-[#2490ff]"
      : "bg-black/[0.05] text-neutral-800 hover:bg-black/[0.08] active:bg-black/[0.11] dark:bg-white/[0.09] dark:text-neutral-100 dark:hover:bg-white/[0.13] dark:active:bg-white/[0.17]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-[26px] items-center gap-1 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

/** Inline notice above the sections (shortcut conflicts, errors). */
export function Notice({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  const styles =
    tone === "warning"
      ? "bg-amber-500/10 text-amber-900 ring-amber-500/25 dark:text-amber-200"
      : "bg-red-500/10 text-red-800 ring-red-500/25 dark:text-red-300";
  return (
    <div
      role="alert"
      className={`flex gap-2.5 rounded-[10px] px-3 py-2.5 text-[12px] leading-[17px] ring-1 ${styles}`}
    >
      <svg viewBox="0 0 16 16" className="mt-px size-3.5 shrink-0" aria-hidden="true">
        <path
          d="M8 1.8 15 14.2H1L8 1.8Z"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.3v3.4M8 11.9v.1"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <div>{children}</div>
    </div>
  );
}
