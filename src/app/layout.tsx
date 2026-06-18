import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

// Applied before paint so the page never flashes the wrong theme. Dark is the
// default; a stored preference (set from Settings → System) wins.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Body/UI face. Highly legible humanist grotesk — built for reading long
// prose (the email/WhatsApp/chat copy that is the core of this app), unlike
// Space Grotesk (the proportional sibling of Space Mono, which made everything
// read "mono-ish" and hurt the prose/data hierarchy).
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Data/label face — kept as the technical "Nothing" identity for mono
// labels, table headers, chips and numbers.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ProspectAI — Open Source B2B Prospecting Engine",
    template: "%s | ProspectAI",
  },
  description:
    "Self-hosted B2B prospecting automation. Find businesses, analyze websites with AI, and send personalized emails and WhatsApp messages on autopilot.",
  keywords: [
    "B2B prospecting",
    "email automation",
    "lead generation",
    "cold email",
    "WhatsApp outreach",
    "AI",
    "open source",
    "self-hosted",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "ProspectAI",
    title: "ProspectAI — Open Source B2B Prospecting Engine",
    description:
      "Self-hosted B2B prospecting automation. Find businesses, analyze websites with AI, and send personalized emails and WhatsApp messages on autopilot.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProspectAI — Open Source B2B Prospecting Engine",
    description:
      "Self-hosted B2B prospecting automation with AI-powered email and WhatsApp outreach.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: "/favicon.ico" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ProspectAI",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Open source B2B prospecting engine. Find businesses, analyze websites with AI, and send personalized outreach on autopilot.",
  url: SITE_URL,
  license: "https://opensource.org/licenses/MIT",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${hankenGrotesk.variable} ${spaceMono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <ThemeProvider>
          <LocaleProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
