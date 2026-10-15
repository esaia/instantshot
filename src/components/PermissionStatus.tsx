import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { PermissionState } from "../lib/types";
import { Button } from "./ui";

/** macOS Screen Recording permission. Rechecked whenever the window regains focus (no polling). */
export function usePermissionState() {
  const [state, setState] = useState<PermissionState | null>(null);

  const refresh = useCallback(() => {
    void api.permissionStatus().then(setState);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return [state, setState] as const;
}

/** Compact "granted" status for the header. */
export function PermissionChip({ state }: { state: PermissionState | null }) {
  if (state !== "granted") return null;
  return (
    <span
      role="status"
      title="Screen Recording permission granted"
      className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300"
    >
      <span className="relative flex size-1.5" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 blur-[2px]" />
        <span className="relative size-1.5 rounded-full bg-emerald-500" />
      </span>
      Screen access on
    </span>
  );
}

/** Explains and fixes a missing permission. Renders nothing once it's granted. */
export function PermissionBanner({
  state,
  onChange,
}: {
  state: PermissionState | null;
  onChange: (state: PermissionState) => void;
}) {
  const [requested, setRequested] = useState(false);
  if (state === null || state === "notRequired" || state === "granted") return null;

  return (
    <div
      role="alert"
      className="overflow-hidden rounded-[12px] bg-gradient-to-b from-amber-500/[0.13] to-amber-500/[0.06] p-4 ring-1 ring-amber-500/30"
    >
      <div className="flex gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-b from-amber-400 to-orange-500 text-white shadow-sm"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.6" />
            <path d="M5.5 14h5M8 11.2V14" />
          </svg>
        </span>
        <div className="min-w-0 space-y-2.5">
          <div>
            <p className="text-[13px] font-semibold leading-[18px]">
              Screen Recording permission needed
            </p>
            <p className="mt-0.5 text-[12px] leading-[17px] text-neutral-600 dark:text-neutral-300">
              InstantShot needs to read the screen region you select. The image is processed on this
              Mac and never uploaded. Enable InstantShot under{" "}
              <span className="font-medium">
                Privacy &amp; Security › Screen &amp; System Audio Recording
              </span>
              , then relaunch the app — macOS applies the change only after a restart.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!requested && (
              <Button
                variant="primary"
                onClick={() => {
                  setRequested(true);
                  void api.requestPermission().then(onChange);
                }}
              >
                Request Access
              </Button>
            )}
            <Button onClick={() => void api.openPermissionSettings()}>Open System Settings</Button>
            <Button onClick={() => void api.restartApp()}>Relaunch InstantShot</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
