import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GingaProvider>{children}</GingaProvider>
        <Toaster />
      </body>
    </html>
  );
}
