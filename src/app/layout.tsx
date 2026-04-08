import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
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
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <LocaleProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
