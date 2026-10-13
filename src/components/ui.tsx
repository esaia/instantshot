import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </h2>
      <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl bg-white ring-1 ring-black/5 dark:divide-white/10 dark:bg-neutral-800 dark:ring-white/10">
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] leading-5">
          {label}
        </label>
        {hint && (
          <div className="text-[12px] leading-4 text-neutral-500 dark:text-neutral-400">{hint}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
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
      className={`relative h-[22px] w-[38px] rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 ${
        checked ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-600"
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow transition-transform ${
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
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700"
      : "bg-white text-neutral-800 ring-1 ring-black/10 hover:bg-neutral-50 active:bg-neutral-100 dark:bg-neutral-700 dark:text-neutral-100 dark:ring-white/10 dark:hover:bg-neutral-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 rounded-md px-3 text-[13px] font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}
