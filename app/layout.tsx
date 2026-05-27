import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cowlytics — AI Cattle Analyzer | Cowly",
  description: "গরুর ছবি দিয়ে AI-তে ওজন, মাংস ও ন্যায্য দাম জানুন। Qurbani cattle analyzer for Bangladesh.",
  keywords: ["কোরবানি", "গরু", "AI", "cattle analyzer", "qurbani", "Bangladesh", "AIT"],
  authors: [{ name: "AIT — Authentic Intelligent Technology", url: "https://ait.net.bd" }],
  creator: "AIT — Authentic Intelligent Technology",
  publisher: "AIT — Authentic Intelligent Technology",

  // ── Required for relative OG image URLs ──────────────────────
  metadataBase: new URL("https://cowly.net.bd"),

  // ── Facebook / Open Graph ─────────────────────────────────────
  openGraph: {
    type:        "website",
    url:         "https://cowly.net.bd",
    siteName:    "Cowlytics — A product of AIT",
    locale:      "bn_BD",
    title:       "Cowlytics — AI দিয়ে গরুর ওজন ও দাম জানুন",
    description: "গরুর ছবি দিন — AI বলবে ওজন, মাংস ও ন্যায্য বাজার মূল্য। কোরবানির গরু কিনুন বুঝে-শুনে। 📞 01517145678",
    images: [
      {
        url:    "/cowly.png",   // must be in /public — 1200×630px recommended
        width:  1200,
        height: 630,
        alt:    "Cowlytics — AI Cattle Analyzer | A product of AIT",
        type:   "image/png",
      },
    ],
  },

  // ── Twitter / X card ─────────────────────────────────────────
  twitter: {
    card:        "summary_large_image",
    title:       "Cowlytics — AI দিয়ে গরুর ওজন ও দাম জানুন",
    description: "গরুর ছবি দিন — AI বলবে ওজন, মাংস ও ন্যায্য বাজার মূল্য। 📞 01517145678",
    images:      ["/cowly.png"],
  },

  // ── Favicon ───────────────────────────────────────────────────
  icons: {
    icon:  [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png" }],
  },

  // ── Extra meta ────────────────────────────────────────────────
  other: {
    "contact:phone_number": "+8801517145678",
    // Facebook explicitly reads these fb:app_id / article:* tags
    // Add your FB App ID here if you have one:
    // "fb:app_id": "YOUR_FB_APP_ID",
  },
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* ── Explicit OG tags (Facebook scraper sometimes misses Next.js auto-inject) ── */}
        <meta property="og:type"         content="website" />
        <meta property="og:url"          content="https://cowly.net.bd" />
        <meta property="og:site_name"    content="Cowlytics — A product of AIT" />
        <meta property="og:title"        content="Cowlytics — AI দিয়ে গরুর ওজন ও দাম জানুন" />
        <meta property="og:description"  content="গরুর ছবি দিন — AI বলবে ওজন, মাংস ও ন্যায্য বাজার মূল্য। কোরবানির গরু কিনুন বুঝে-শুনে। 📞 01517145678" />
        <meta property="og:image"        content="https://cowly.net.bd/cowly.png" />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt"    content="Cowlytics — AI Cattle Analyzer | A product of AIT" />
        <meta property="og:locale"       content="bn_BD" />

        {/* ── AIT branding ── */}
        <meta name="author"     content="AIT — Authentic Intelligent Technology" />
        <meta name="publisher"  content="AIT — Authentic Intelligent Technology" />
        <meta name="copyright"  content="A product of AIT — Authentic Intelligent Technology" />
        <meta name="contact"    content="01517145678" />
        <meta name="website"    content="https://ait.net.bd" />

        {/* ── PWA ── */}
        <meta name="theme-color"                           content="#10B981" />
        <meta name="mobile-web-app-capable"                content="yes" />
        <meta name="apple-mobile-web-app-capable"          content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title"            content="Cowlytics" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}