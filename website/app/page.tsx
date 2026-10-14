import { DesktopDemo } from "./desktop-demo";
import { HeroCapture } from "./hero-capture";
import { PickLogo } from "./logo";

const RELEASES = "https://github.com/esaia/textpicker/releases/latest";
const GITHUB = "https://github.com/esaia/textpicker";
const X_PROFILE = "https://x.com/esaia__";

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 12.73c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.29-3.52ZM14.2 6.27c.6-.73 1.01-1.75.9-2.77-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.21Z"
      />
    </svg>
  );
}

function WindowsLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 5.5 10.5 4.4v7.1H3V5.5Zm0 13 7.5 1.1v-7H3v5.9Zm8.4 1.2L21 21v-8.4h-9.6v7.1Zm0-15.4v7.2H21V3l-9.6 1.3Z"
      />
    </svg>
  );
}

const steps = [
  {
    keys: ["⇧", "⌘", "2"],
    title: "Copy any text",
    body: "Drag over the words in a video, photo, PDF or app. They’re on your clipboard, with line breaks where the original has them. On Windows it’s Ctrl+Shift+2.",
  },
  {
    keys: ["⇧", "⌘", "1"],
    title: "Snip a screenshot",
    body: "Drag over any part of the screen, then move or resize the selection. Copy it right away, or open it in the editor. On Windows it’s Ctrl+Shift+1.",
  },
  {
    keys: ["edit"],
    title: "Make it beautiful",
    body: "Put it on a wallpaper, gradient or color with padding, rounded corners and a shadow. Add arrows, text or blur, then copy, save or drag it out.",
  },
];

const places = [
  ["Video and recorded calls", "Subtitles, slides in a screen share, code in a tutorial."],
  ["Photos and screenshots", "A Wi-Fi password on a poster, an address in a picture."],
  ["Scanned PDFs", "Contracts and receipts that won’t let you select a line."],
  ["Apps and dialogs", "Error messages, labels and anything else you’d normally retype."],
];

const faqs = [
  {
    q: "Does my screen get uploaded anywhere?",
    a: "No. Text is recognized by your operating system’s built-in engine: Apple Vision on macOS and Windows OCR on Windows. Screenshots stay in memory until you copy or save them. There’s no account, no analytics and no network request.",
  },
  {
    q: "What can I do with a screenshot?",
    a: "Copy it straight from the selection, or open it in the editor: place it on a wallpaper (including your own desktop pictures), a gradient or a color, adjust padding, corners, shadow and size, and add arrows, shapes, text, blur or pixelation. Then copy it, save it, or drag it into any app.",
  },
  {
    q: "Which systems does it run on?",
    a: "macOS 14 Sonoma or later, on Apple Silicon and Intel, and Windows 10 or 11. On macOS you grant Screen Recording permission once so TextPicker can read the area you select.",
  },
  {
    q: "Which languages can it read?",
    a: "Whatever your system’s recognizer supports. On a current Mac that’s about 30 languages, including English, most European languages, Chinese, Japanese, Korean and Arabic. On Windows it uses the OCR languages installed for your profile.",
  },
  {
    q: "Can I change the shortcuts?",
    a: "Yes, both of them. The defaults are ⇧⌘2 for text and ⇧⌘1 for screenshots (Ctrl+Shift+2 and Ctrl+Shift+1 on Windows). Pick any combination in Settings; TextPicker tells you if another app already uses it.",
  },
  {
    q: "What if it can’t read something?",
    a: "You’ll see “No text found” and your clipboard stays exactly as it was. Protected content, such as DRM video, shows up black to every capture tool, including this one.",
  },
];

function Downloads() {
  return (
    <div className="downloads">
      <a className="button button-primary" href={RELEASES}>
        <AppleLogo /> Download for Mac
      </a>
      <a className="button button-ghost" href={RELEASES}>
        <WindowsLogo /> Windows
      </a>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="nav-wrap">
        <nav className="nav" aria-label="Main">
          <a className="brand" href="#top">
            <PickLogo className="brand-mark" />
            TextPicker
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#faq">FAQ</a>
          </div>
          <a className="nav-github" href={GITHUB} aria-label="TextPicker on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
              />
            </svg>
          </a>
          <a className="nav-cta" href={RELEASES}>
            Download
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <HeroCapture>
            <div className="hero-copy">
              <p className="tag">For macOS and Windows</p>
              <h1 id="hero-title" className="hc-target">
                <span className="line">Snip anything.</span>
                <span className="line">Copy any text</span>
                <span className="line">
                  <span className="hl">on screen.</span>
                </span>
              </h1>
              <p className="lede">
                Take beautiful screenshots or copy text from anything on your screen: videos,
                photos, scanned PDFs, any app. One shortcut each, all on your device.
              </p>
              <Downloads />
              <p className="fineprint">Nothing is uploaded. Your screen never leaves your device.</p>
            </div>
          </HeroCapture>
        </section>

        <section className="section" id="how" aria-labelledby="how-title">
          <h2 id="how-title">
            Two shortcuts. <span className="hl">No busywork.</span>
          </h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.title} className="step">
                <span className="keys" aria-hidden="true">
                  {s.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="try">
            <DesktopDemo />
          </div>
        </section>

        <section className="section split" aria-labelledby="where-title">
          <div>
            <h2 id="where-title">
              Text you can see <span className="hl">but can’t select.</span>
            </h2>
            <p className="section-lede">
              If it’s on your screen, TextPicker can read it. It keeps reading order and indentation,
              so code and lists paste the way they look.
            </p>
          </div>
          <ul className="places">
            {places.map(([title, body]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section privacy" id="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">
            Your screen <span className="hl">stays on your computer.</span>
          </h2>
          <div className="privacy-grid">
            <p>
              TextPicker reads only the area you select. Text is recognized by the engine that ships
              with your operating system, and screenshots stay in memory until you copy or save
              them.
            </p>
            <ul className="facts">
              <li>No uploads and no cloud OCR</li>
              <li>No account, analytics or tracking</li>
              <li>Screenshots are saved only when you save them</li>
              <li>Your clipboard is untouched if nothing is found</li>
            </ul>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Questions</h2>
          <div className="faq-list">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="maker" aria-labelledby="maker-title">
          <div className="maker-card">
            <div className="maker-photo">
              <img src="/esaia-avatar-lg.jpg" alt="Esaia" width={160} height={160} />
              <PickLogo className="maker-badge" />
            </div>
            <div className="maker-copy">
              <p className="maker-label">The human behind TextPicker</p>
              <h2 id="maker-title">
                Hey, I’m Esaia <span aria-hidden="true">👋</span>
              </h2>
              <p>
                I kept retyping text I could already see: a line from a video, a quote in a
                screenshot, a paragraph locked inside a PDF. So I built the tool I wanted. One
                shortcut, and the words are on my clipboard. Then I added the screenshot tool I
                always wished came with my computer.
              </p>
              <p>
                TextPicker is small on purpose, and it runs entirely on your computer. If something
                doesn’t work or you have an idea, tell me.
              </p>
              <div className="maker-links">
                <a href={X_PROFILE}>Say hi on X</a>
                <a href={GITHUB}>Follow along on GitHub</a>
              </div>
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">
            Your whole screen, <span className="hl">one shortcut away.</span>
          </h2>
          <Downloads />
          <p className="fineprint">Requires macOS 14 or later (Apple Silicon or Intel), or Windows 10 or 11.</p>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#top">
          <PickLogo className="brand-mark" />
          TextPicker
        </a>
        <a href={GITHUB}>Source on GitHub</a>
      </footer>
    </>
  );
}
