import { useEffect, useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { formatShortcut } from "../lib/shortcut";
import { api, openExternal } from "../lib/tauri";
import type { LanguageStatus } from "../lib/types";
import { PermissionStatus } from "./PermissionStatus";
import { ShortcutInput } from "./ShortcutInput";
import { Button, Row, Section, Toggle } from "./ui";

const GITHUB_URL = "https://github.com/esaia/textpicker";
const WEBSITE_URL = "https://textpicker.app";

export function Settings() {
  const { settings, info, launchAtLogin, error, update, setShortcut, setLaunchAtLogin } =
    useSettings();
  const languages = useLanguageStatus();

  if (!settings || !info) return null;
  const isMac = info.platform === "macos";
  const shortcutLabel = formatShortcut(settings.shortcut, info.platform);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-6">
      <header className="flex items-center gap-3 px-1">
        <AppIcon />
        <div>
          <h1 className="text-[15px] font-semibold leading-5">TextPicker</h1>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            Press <kbd className="font-sans font-medium">{shortcutLabel}</kbd>, drag over any text,
            then paste.
          </p>
        </div>
      </header>

      {!info.shortcutRegistered && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        >
          The capture shortcut couldn’t be registered, probably because another app uses it. Choose
          a different shortcut below. You can still capture from the {isMac ? "menu bar" : "tray"}{" "}
          icon.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {isMac && (
        <Section title="Permissions">
          <PermissionStatus />
        </Section>
      )}

      <Section title="Capture">
        <Row label="Capture shortcut" hint="Works anywhere, even when this window is closed.">
          <ShortcutInput
            value={settings.shortcut}
            platform={info.platform}
            onChange={setShortcut}
          />
        </Row>
        <Row label="Reset to default" hint={formatShortcut(info.defaultShortcut, info.platform)}>
          <Button
            disabled={settings.shortcut === info.defaultShortcut}
            onClick={() => void setShortcut(info.defaultShortcut)}
          >
            Reset
          </Button>
        </Row>
      </Section>

      <Section title="General">
        <Row label="Launch at login" htmlFor="login">
          <Toggle id="login" checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
        </Row>
        <Row label="Show confirmation after copying" htmlFor="notify">
          <Toggle
            id="notify"
            checked={settings.showNotification}
            onChange={(v) => void update({ showNotification: v })}
          />
        </Row>
        <Row
          label="Start minimized"
          hint={`Don't open this window when TextPicker starts. Find it in the ${isMac ? "menu bar" : "system tray"}.`}
          htmlFor="minimized"
        >
          <Toggle
            id="minimized"
            checked={settings.startMinimized}
            onChange={(v) => void update({ startMinimized: v })}
          />
        </Row>
      </Section>

      <Section title="Text recognition">
        {isMac ? (
          <Row
            label="Detect language automatically"
            hint="Otherwise uses your preferred system languages."
            htmlFor="autolang"
          >
            <Toggle
              id="autolang"
              checked={settings.autoLanguage}
              onChange={(v) => void update({ autoLanguage: v })}
            />
          </Row>
        ) : (
          <Row
            label="Language"
            hint="Windows uses the OCR languages installed for your user profile."
          />
        )}
        <Row
          label="Preserve line breaks"
          hint="When off, wrapped lines are joined into paragraphs."
          htmlFor="linebreaks"
        >
          <Toggle
            id="linebreaks"
            checked={settings.preserveLineBreaks}
            onChange={(v) => void update({ preserveLineBreaks: v })}
          />
        </Row>
        <LanguageRow status={languages} isMac={isMac} />
      </Section>

      <Section title="About">
        <Row label="Version">
          <span className="text-[13px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {info.version}
          </span>
        </Row>
        <Row label="System">
          <span className="text-[13px] text-neutral-500 dark:text-neutral-400">{info.os}</span>
        </Row>
        <Row
          label="Privacy"
          hint="Text is recognized on this device. Nothing is uploaded or stored."
        />
        <Row label="Links">
          <Button onClick={() => openExternal(WEBSITE_URL)}>Website</Button>
          <Button onClick={() => openExternal(GITHUB_URL)}>GitHub</Button>
        </Row>
      </Section>
    </main>
  );
}

function useLanguageStatus() {
  const [status, setStatus] = useState<LanguageStatus | null>(null);
  useEffect(() => {
    void api.ocrLanguageStatus().then(setStatus);
  }, []);
  return status;
}

function LanguageRow({ status, isMac }: { status: LanguageStatus | null; isMac: boolean }) {
  if (!status) return null;
  if (!status.available) {
    return (
      <Row
        label="No OCR language installed"
        hint={
          isMac
            ? "Text recognition is unavailable on this system."
            : "Add a language with the “Optical character recognition” feature in Settings › Time & language › Language & region."
        }
      />
    );
  }
  const names = displayNames(status.languages);
  return (
    <Row
      label="Recognized languages"
      hint={
        names.length > 6
          ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`
          : names.join(", ")
      }
    />
  );
}

function displayNames(tags: string[]): string[] {
  const dn = new Intl.DisplayNames(undefined, { type: "language" });
  const seen = new Set<string>();
  for (const tag of tags) {
    try {
      seen.add(dn.of(tag) ?? tag);
    } catch {
      seen.add(tag);
    }
  }
  return [...seen];
}

function AppIcon() {
  return (
    <div className="grid size-10 place-items-center rounded-[10px] bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
      <svg viewBox="0 0 24 24" className="size-6 text-white" aria-hidden="true">
        <path
          d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M8.5 8.5h7M12 8.5v7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
