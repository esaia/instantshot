import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, X_PROFILE } from "./site";

// Variable Inter with the optical-size axis: large headlines switch to the tighter display cut.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "InstantShot",
    "screenshot tool",
    "screenshot app",
    "copy text from screen",
    "copy text from image",
    "copy text from video",
    "OCR",
    "screen OCR",
    "text recognition",
    "image to text",
    "scanned PDF to text",
    "screenshot editor",
    "screenshot beautifier",
    "annotate screenshots",
    "macOS screenshot",
    "Windows screenshot",
    "free",
    "open source",
    "offline",
    "privacy",
  ],
  authors: [{ name: "Esaia", url: X_PROFILE }],
  creator: "Esaia",
  publisher: "Esaia",
  category: "productivity",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: "Snip anything. Copy any text on screen. Free and open source, for macOS and Windows.",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "Snip anything. Copy any text on screen. Free and open source, for macOS and Windows.",
    creator: "@esaia__",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0f1217",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions often add attributes to <html> before React loads; this ignores
    // attribute differences on this one element only (children are still checked).
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Runs before the first paint so the right download button is highlighted at once. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline snippet
          dangerouslySetInnerHTML={{
            __html:
              'if(/Windows/.test(navigator.userAgent))document.documentElement.dataset.os="windows"',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
