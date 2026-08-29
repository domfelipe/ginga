import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { GingaProvider } from "@/components/provider/GingaProvider";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Display face for every heading (hero, page titles, card titles, studio
   section heads) — variable weight, optical sizing for the bakery voice. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Ginga — Padaria Aurora",
  description: "Teach AI agents by showing, not coding",
  openGraph: {
    title: "Ginga — Padaria Aurora",
    description:
      "Order like a human; agents learn. Record a flow once and Ginga turns it into a live WebMCP tool any site or agent can call.",
    url: SITE_URL,
    type: "website",
    siteName: "Ginga",
    images: [{ url: `${SITE_URL}/og.png`, width: 1280, height: 720, alt: "Ginga — Teach AI by showing" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GingaProvider>{children}</GingaProvider>
        <Toaster />
      </body>
    </html>
  );
}
