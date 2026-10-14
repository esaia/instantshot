import { useEffect, useState } from "react";
import { onEvent } from "../lib/tauri";
import type { ToastPayload } from "../lib/types";

/** HUD content. The window itself is positioned, shown and hidden by Rust. */
export function Toast() {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let id = 0;
    const offShow = onEvent<ToastPayload>("toast:show", (payload) => {
      id += 1;
      setLeaving(false);
      setToast({ ...payload, id });
    });
    const offHide = onEvent("toast:hide", () => setLeaving(true));
    return () => {
      offShow();
      offHide();
    };
  }, []);

  if (!toast) return null;
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div
        key={toast.id}
        role="status"
        className={`hud-pill flex max-w-full items-center gap-2.5 rounded-full py-2 pr-4 pl-2 ${
          leaving ? "hud-leave" : "hud-enter"
        }`}
      >
        {toast.success ? <CheckIcon /> : <InfoIcon />}
        <span className="truncate text-[13px] font-medium tracking-[-0.01em]">{toast.message}</span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 22 22" className="size-[22px] shrink-0" aria-hidden="true">
      <circle cx="11" cy="11" r="11" fill="#30d158" />
      <path
        d="M6.6 11.4l3 3 5.8-6.6"
        fill="none"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 22 22" className="size-[22px] shrink-0" aria-hidden="true">
      <circle cx="11" cy="11" r="11" fill="#ff9f0a" />
      <path d="M11 6.2v6M11 15.6v.2" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
