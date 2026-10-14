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
  const {
    settings,
    info,
    launchAtLogin,
    error,
    update,
    setShortcut,
    setScreenshotShortcut,
    changeSaveFolder,
    setLaunchAtLogin,
  } = useSettings();
  const languages = useLanguageStatus();

  if (!settings || !info) return null;
  const isMac = info.platform === "macos";
  const shortcutLabel = formatShortcut(settings.shortcut, info.platform);
  const screenshotLabel = formatShortcut(settings.screenshotShortcut, info.platform);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-6">
      <header className="flex items-center gap-3 px-1">
        <AppIcon />
        <div>
          <h1 className="text-[15px] font-semibold leading-5">TextPicker</h1>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            Press <kbd className="font-sans font-medium">{shortcutLabel}</kbd> to copy text, or{" "}
            <kbd className="font-sans font-medium">{screenshotLabel}</kbd> for a screenshot.
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

      {info.shortcutRegistered && !info.screenshotShortcutRegistered && (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
        >
          The screenshot shortcut couldn’t be registered, probably because another app uses it.
          Choose a different one below.
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
        <Row label="Capture text" hint="Recognizes text in a region and copies it.">
          <ShortcutInput
            value={settings.shortcut}
            platform={info.platform}
            onChange={setShortcut}
            label="Capture text shortcut"
          />
          <ResetButton
            disabled={settings.shortcut === info.defaultShortcut}
            title={formatShortcut(info.defaultShortcut, info.platform)}
            onClick={() => void setShortcut(info.defaultShortcut)}
          />
        </Row>
        <Row label="Capture screenshot" hint="Opens the region in the screenshot editor.">
          <ShortcutInput
            value={settings.screenshotShortcut}
            platform={info.platform}
            onChange={setScreenshotShortcut}
            label="Capture screenshot shortcut"
          />
          <ResetButton
            disabled={settings.screenshotShortcut === info.defaultScreenshotShortcut}
            title={formatShortcut(info.defaultScreenshotShortcut, info.platform)}
            onClick={() => void setScreenshotShortcut(info.defaultScreenshotShortcut)}
          />
        </Row>
        <Row label="Shortcuts work anywhere" hint="Even when this window is closed." />
      </Section>

      <Section title="Screenshots">
        <Row
          label="Quick save folder"
          hint={<span className="break-all">{info.saveFolder ?? "Desktop"}</span>}
        >
          {settings.saveFolder !== null && (
            <Button onClick={() => void changeSaveFolder(true)}>Use Desktop</Button>
          )}
          <Button onClick={() => void changeSaveFolder(false)}>Choose…</Button>
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
          hint="Everything happens on this device. Nothing is uploaded, and screenshots are only saved when you save them."
        />
        <Row label="Links">
          <Button onClick={() => openExternal(WEBSITE_URL)}>Website</Button>
          <Button onClick={() => openExternal(GITHUB_URL)}>GitHub</Button>
        </Row>
      </Section>
    </main>
  );
}

function ResetButton({
  disabled,
  title,
  onClick,
}: {
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={`Reset to ${title}`}
      aria-label={`Reset to ${title}`}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent dark:text-neutral-400 dark:hover:bg-white/10"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path
          d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5v2.5h2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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
  // Brand mark: a guitar pick ("Picker") with a text cursor inside snip corners.
  return (
    <svg viewBox="0 0 64 64" className="size-10 shrink-0" aria-hidden="true">
      <path
        d="M32 59.5c-1.4 0-2.6-.7-3.5-1.8C19.6 47.6 6 32.4 6 20.2 6 10.3 17 5 32 5s26 5.3 26 15.2c0 12.2-13.6 27.4-22.5 37.5-.9 1.1-2.1 1.8-3.5 1.8Z"
        fill="#ade4fc"
      />
      <path
        d="M29 22h6M29 36h6M32 22v14"
        fill="none"
        stroke="#0f1217"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M22 18v-3.5h3.5M38.5 14.5H42V18M42 37.5V41h-3.5M25.5 41H22v-3.5"
        fill="none"
        stroke="#0f1217"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
