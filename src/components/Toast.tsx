import { useEffect, useState } from "react";
import { onEvent } from "../lib/tauri";
import type { ToastPayload } from "../lib/types";

/** HUD content. The window itself is positioned, shown and hidden by Rust. */
export function Toast() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => onEvent<ToastPayload>("toast:show", setToast), []);

  if (!toast) return null;
  return (
    <div className="flex h-full items-center justify-center p-1">
      <div
        role="status"
        className="flex max-w-full items-center gap-2 rounded-full bg-neutral-900/85 px-4 py-2 text-[13px] font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
      >
        {toast.success ? <CheckIcon /> : <InfoIcon />}
        <span className="truncate">{toast.message}</span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-emerald-400" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-amber-300" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5v4.5M8 11.2v.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
