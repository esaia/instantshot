const VIEWS = [
  { label: "settings", name: "Settings", query: "" },
  { label: "overlay-preview", name: "Overlay", query: "?view=overlay" },
  { label: "toast", name: "Toast", query: "?view=toast" },
];

/** Shown only when the UI is opened in a regular browser instead of the Tauri app. */
export function PreviewBar({ current }: { current: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-100 px-3 py-1.5 text-[12px] text-amber-900 shadow-sm dark:bg-amber-500/20 dark:text-amber-100">
      <span>
        Browser preview — native features are simulated. Run <code>pnpm tauri dev</code> for the
        real app.
      </span>
      <nav className="flex gap-2">
        {VIEWS.map((v) => (
          <a
            key={v.label}
            href={`/${v.query}`}
            aria-current={v.label === current ? "page" : undefined}
            className="rounded px-1.5 underline-offset-2 hover:underline aria-[current=page]:bg-amber-200 aria-[current=page]:font-semibold dark:aria-[current=page]:bg-amber-500/30"
          >
            {v.name}
          </a>
        ))}
      </nav>
    </div>
  );
}
