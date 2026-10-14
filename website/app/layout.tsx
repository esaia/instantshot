import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Variable Inter with the optical-size axis: large headlines switch to the tighter display cut.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TextPicker: snip anything, copy any text on screen",
  description:
    "Take beautiful screenshots or copy text from anything on your screen: videos, photos, scanned PDFs, any app. One shortcut each, all on your device. For macOS and Windows.",
  openGraph: {
    title: "TextPicker",
    description: "Snip anything. Copy any text on screen.",
    type: "website",
  },
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
      <body>{children}</body>
    </html>
  );
}
