import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Variable Inter with the optical-size axis: large headlines switch to the tighter display cut.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "TextPicker: copy text from anything on your screen",
  description:
    "Press a shortcut, drag over any text on your screen, and paste it. Videos, photos, PDFs, apps. Recognized on your device, for macOS and Windows.",
  openGraph: {
    title: "TextPicker",
    description: "Copy text from anything on your screen.",
    type: "website",
  },
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
