import { useEffect, useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { formatShortcut } from "../lib/shortcut";
import { api, openExternal } from "../lib/tauri";
import type { LanguageStatus } from "../lib/types";
import { PermissionBanner, PermissionChip, usePermissionState } from "./PermissionStatus";
import { Keys, ShortcutInput } from "./ShortcutInput";
import { Button, Notice, Row, RowIcon, Section, Toggle } from "./ui";

const GITHUB_URL = "https://github.com/esaia/instantshot";
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
  const [permission, setPermission] = usePermissionState();

  if (!settings || !info) return null;
  const isMac = info.platform === "macos";
  const trayName = isMac ? "menu bar" : "system tray";
  const folder = info.saveFolder ?? "Desktop";

  return (
    <main className="mx-auto max-w-[560px] space-y-6 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3.5 px-1">
        <AppIcon />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em]">InstantShot</h1>
            <span className="rounded-full bg-black/[0.05] px-1.5 py-px text-[10.5px] font-medium tabular-nums text-neutral-500 dark:bg-white/[0.08] dark:text-neutral-400">
              v{info.version}
            </span>
            {isMac && <PermissionChip state={permission} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            <span className="inline-flex items-center gap-1.5">
              <Keys accelerator={settings.shortcut} platform={info.platform} size="sm" />
              Copy text
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Keys accelerator={settings.screenshotShortcut} platform={info.platform} size="sm" />
              Screenshot
            </span>
          </p>
        </div>
      </header>

      {isMac && <PermissionBanner state={permission} onChange={setPermission} />}

      {!info.shortcutRegistered && (
        <Notice tone="warning">
          The capture shortcut couldn’t be registered, probably because another app uses it. Choose
          a different shortcut below. You can still capture from the {isMac ? "menu bar" : "tray"}{" "}
          icon.
        </Notice>
      )}

      {info.shortcutRegistered && !info.screenshotShortcutRegistered && (
        <Notice tone="warning">
          The screenshot shortcut couldn’t be registered, probably because another app uses it.
          Choose a different one below.
        </Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <Section
        title="Capture"
        footer="Shortcuts work in any app, even when this window is closed. Click one to change it."
      >
        <Row
          label="Capture text"
          hint="Recognizes text in a region and copies it."
          icon={
            <RowIcon tint="blue">
              <path d="M6 3.5h4M6 12.5h4M8 3.5v9" />
            </RowIcon>
          }
        >
          <ResetButton
            hidden={settings.shortcut === info.defaultShortcut}
            title={formatShortcut(info.defaultShortcut, info.platform)}
            onClick={() => void setShortcut(info.defaultShortcut)}
          />
          <ShortcutInput
            value={settings.shortcut}
            platform={info.platform}
            onChange={setShortcut}
            label="Capture text shortcut"
          />
        </Row>
        <Row
          label="Capture screenshot"
          hint="Select a region, then copy it or open the editor."
          icon={
            <RowIcon tint="purple">
              <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
              <circle cx="8" cy="8" r="2" />
            </RowIcon>
          }
        >
          <ResetButton
            hidden={settings.screenshotShortcut === info.defaultScreenshotShortcut}
            title={formatShortcut(info.defaultScreenshotShortcut, info.platform)}
            onClick={() => void setScreenshotShortcut(info.defaultScreenshotShortcut)}
          />
          <ShortcutInput
            value={settings.screenshotShortcut}
            platform={info.platform}
            onChange={setScreenshotShortcut}
            label="Capture screenshot shortcut"
          />
        </Row>
      </Section>

      <Section title="Screenshots">
        <Row
          label="Quick save folder"
          hint={
            <span className="block truncate" title={folder}>
              {shortPath(folder)}
            </span>
          }
          icon={
            <RowIcon tint="teal">
              <path d="M2 4.5c0-.8.6-1.5 1.5-1.5h2.8l1.4 1.5h4.8c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5h-9c-.9 0-1.5-.7-1.5-1.5v-7Z" />
            </RowIcon>
          }
        >
          {settings.saveFolder !== null && (
            <Button onClick={() => void changeSaveFolder(true)}>Use Desktop</Button>
          )}
          <Button onClick={() => void changeSaveFolder(false)}>Choose…</Button>
        </Row>
      </Section>

      <Section title="General">
        <Row
          label="Launch at login"
          htmlFor="login"
          icon={
            <RowIcon tint="gray">
              <path d="M8 2v5.5M4.6 4.2a5 5 0 1 0 6.8 0" />
            </RowIcon>
          }
        >
          <Toggle id="login" checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
        </Row>
        <Row
          label="Show confirmation after copying"
          htmlFor="notify"
          icon={
            <RowIcon tint="red">
              <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11ZM6.5 14h3" />
            </RowIcon>
          }
        >
          <Toggle
            id="notify"
            checked={settings.showNotification}
            onChange={(v) => void update({ showNotification: v })}
          />
        </Row>
        <Row
          label="Start minimized"
          hint={`Don't open this window at launch. Find InstantShot in the ${trayName}.`}
          htmlFor="minimized"
          icon={
            <RowIcon tint="indigo">
              <rect x="2" y="3" width="12" height="10" rx="1.8" />
              <path d="M5.5 9.5h5" />
            </RowIcon>
          }
        >
          <Toggle
            id="minimized"
            checked={settings.startMinimized}
            onChange={(v) => void update({ startMinimized: v })}
          />
        </Row>
      </Section>

      <Section title="Text Recognition">
        {isMac ? (
          <Row
            label="Detect language automatically"
            hint="Otherwise uses your preferred system languages."
            htmlFor="autolang"
            icon={<GlobeIcon />}
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
            icon={<GlobeIcon />}
          />
        )}
        <Row
          label="Preserve line breaks"
          hint="When off, wrapped lines are joined into paragraphs."
          htmlFor="linebreaks"
          icon={
            <RowIcon tint="orange">
              <path d="M2.5 4h11M2.5 8h8.5a2 2 0 0 1 0 4H8.5M10 10.5 8.5 12l1.5 1.5M2.5 12h3" />
            </RowIcon>
          }
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
        <Row
          label="Privacy"
          hint="Everything happens on this device. Nothing is uploaded, and screenshots are only saved when you save them."
          icon={
            <RowIcon tint="green">
              <path d="M8 1.8 13 3.6v4c0 3.2-2.2 5.6-5 6.6-2.8-1-5-3.4-5-6.6v-4l5-1.8Z" />
              <path d="m5.8 8 1.5 1.5 2.9-3" />
            </RowIcon>
          }
        />
        <Row
          label="System"
          icon={
            <RowIcon tint="gray">
              <rect x="2" y="3" width="12" height="8" rx="1.5" />
              <path d="M5.5 14h5" />
            </RowIcon>
          }
        >
          <span className="text-[12px] text-neutral-500 dark:text-neutral-400">{info.os}</span>
        </Row>
        <Row
          label="Links"
          icon={
            <RowIcon tint="blue">
              <path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.6.6M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.6-.6" />
            </RowIcon>
          }
        >
          <Button onClick={() => openExternal(WEBSITE_URL)}>
            Website
            <ExternalIcon />
          </Button>
          <Button onClick={() => openExternal(GITHUB_URL)}>
            GitHub
            <ExternalIcon />
          </Button>
        </Row>
      </Section>
    </main>
  );
}

/** "/Users/name/Pictures/Shots" → "~/Pictures/Shots" (same for Windows profile folders). */
function shortPath(path: string): string {
  return path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=$|[\\/])/, "~");
}

function GlobeIcon() {
  return (
    <RowIcon tint="blue">
      <circle cx="8" cy="8" r="5.8" />
      <path d="M2.2 8h11.6M8 2.2c1.6 1.6 2.4 3.5 2.4 5.8S9.6 12.2 8 13.8C6.4 12.2 5.6 10.3 5.6 8S6.4 3.8 8 2.2Z" />
    </RowIcon>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-2.5 opacity-60"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 2.5h5v5M9.5 2.5 3 9" />
    </svg>
  );
}

/** Restores the default shortcut. Invisible (but keeps its space) while already default. */
function ResetButton({
  hidden,
  title,
  onClick,
}: {
  hidden: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={hidden}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      title={`Reset to ${title}`}
      aria-label={`Reset to ${title}`}
      onClick={onClick}
      className={`flex size-6 items-center justify-center rounded-full text-neutral-500 transition-opacity hover:bg-black/[0.06] hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-200 ${
        hidden ? "invisible opacity-0" : ""
      }`}
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
        icon={<LanguagesIcon />}
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
      icon={<LanguagesIcon />}
      hint={
        names.length > 6
          ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more`
          : names.join(", ")
      }
    />
  );
}

function LanguagesIcon() {
  return (
    <RowIcon tint="teal">
      <path d="M2.5 3.5h6M5.5 2v1.5M3.8 3.5c.4 2.3 1.9 4 3.9 4.8M7.3 3.5c-.4 2.2-1.9 4-4 5" />
      <path d="m8.5 14 2.5-6 2.5 6M9.3 12.2h3.4" />
    </RowIcon>
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
    <svg
      viewBox="0 0 64 64"
      className="size-12 shrink-0 drop-shadow-[0_4px_12px_rgb(56_189_248/0.35)]"
      aria-hidden="true"
    >
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
