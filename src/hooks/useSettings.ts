import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/tauri";
import type { AppInfo, Settings } from "../lib/types";

/** Loads settings once and exposes optimistic updates that roll back on failure. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [launchAtLogin, setLaunchAtLoginState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLogin = useCallback(() => {
    void api.getLaunchAtLogin().then(setLaunchAtLoginState);
  }, []);

  useEffect(() => {
    void Promise.all([api.getSettings(), api.appInfo()]).then(([s, i]) => {
      setSettings(s);
      setInfo(i);
    });
    refreshLogin();
    // The tray menu can toggle the login item too; resync when the window regains focus.
    window.addEventListener("focus", refreshLogin);
    return () => window.removeEventListener("focus", refreshLogin);
  }, [refreshLogin]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        setSettings(await api.updateSettings(next));
        setError(null);
      } catch (err) {
        setSettings(previous);
        setError(errorMessage(err));
      }
    },
    [settings],
  );

  /** Returns an error message, or null on success. */
  const setShortcut = useCallback(async (shortcut: string): Promise<string | null> => {
    try {
      setSettings(await api.setShortcut(shortcut));
      setInfo(await api.appInfo());
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }, []);

  const setLaunchAtLogin = useCallback(async (enabled: boolean) => {
    setLaunchAtLoginState(enabled);
    try {
      await api.setLaunchAtLogin(enabled);
      setError(null);
    } catch (err) {
      setLaunchAtLoginState(!enabled);
      setError(errorMessage(err));
    }
  }, []);

  return { settings, info, launchAtLogin, error, update, setShortcut, setLaunchAtLogin };
}
