import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { PermissionState } from "../lib/types";
import { Button } from "./ui";

/** macOS Screen Recording permission. Rechecked whenever the window regains focus (no polling). */
export function PermissionStatus() {
  const [state, setState] = useState<PermissionState | null>(null);
  const [requested, setRequested] = useState(false);

  const refresh = useCallback(() => {
    void api.permissionStatus().then(setState);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  if (state === null || state === "notRequired") return null;

  if (state === "granted") {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-[13px]">
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Screen Recording permission granted
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
        Screen Recording permission needed
      </div>
      <p className="text-[12px] leading-[18px] text-neutral-600 dark:text-neutral-300">
        TextPicker needs to read the screen region you select. The image is processed on this Mac
        and never uploaded. Enable TextPicker under{" "}
        <span className="font-medium">
          Privacy &amp; Security › Screen &amp; System Audio Recording
        </span>
        , then relaunch the app — macOS applies the change only after a restart.
      </p>
      <div className="flex flex-wrap gap-2">
        {!requested && (
          <Button
            variant="primary"
            onClick={() => {
              setRequested(true);
              void api.requestPermission().then(setState);
            }}
          >
            Request Access
          </Button>
        )}
        <Button onClick={() => void api.openPermissionSettings()}>Open System Settings</Button>
        <Button onClick={() => void api.restartApp()}>Relaunch TextPicker</Button>
      </div>
    </div>
  );
}
