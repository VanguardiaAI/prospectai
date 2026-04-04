import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono, Crimson_Pro } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://agentes.email";

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

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Agentes.email — Prospección Inteligente con IA",
    template: "%s | Agentes.email",
  },
  description:
    "Automatiza la prospección B2B para tu agencia digital. Busca negocios, analiza sus webs con IA y envía emails y WhatsApp personalizados en autopilot.",
  keywords: [
    "prospección B2B",
    "email marketing automatizado",
    "agencia digital",
    "automatización ventas",
    "generación de leads",
    "cold email",
    "WhatsApp marketing",
    "inteligencia artificial",
    "análisis web",
    "outreach automatizado",
  ],
  authors: [{ name: "VanguardIA.dev", url: "https://vanguardia.dev" }],
  creator: "VanguardIA.dev",
  publisher: "SOLUCIONES IA PROCURSA SAS",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: "Agentes.email",
    title: "Agentes.email — Prospección Inteligente con IA",
    description:
      "Automatiza la prospección B2B para tu agencia digital. Busca negocios, analiza sus webs con IA y envía emails y WhatsApp personalizados en autopilot.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentes.email — Prospección Inteligente con IA",
    description:
      "Automatiza la prospección B2B para tu agencia digital. Busca negocios, analiza webs con IA y envía mensajes personalizados.",
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
  "@graph": [
    {
      "@type": "Organization",
      name: "SOLUCIONES IA PROCURSA SAS",
      alternateName: "VanguardIA.dev",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.ico`,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Av. de la Cantera 2550",
        addressLocality: "Querétaro",
        addressCountry: "MX",
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: "contacto@agentes.email",
        contactType: "customer service",
        availableLanguage: ["Spanish", "English"],
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Agentes.email",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Plataforma SaaS de prospección B2B automatizada con IA. Busca negocios, analiza sus webs y envía mensajes personalizados.",
      url: SITE_URL,
      author: { "@type": "Organization", name: "VanguardIA.dev" },
      offers: [
        { "@type": "Offer", name: "Starter", price: "29", priceCurrency: "EUR", billingDuration: "P1M" },
        { "@type": "Offer", name: "Pro", price: "79", priceCurrency: "EUR", billingDuration: "P1M" },
        { "@type": "Offer", name: "Scale", price: "149", priceCurrency: "EUR", billingDuration: "P1M" },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${spaceMono.variable} ${crimsonPro.variable} h-full`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;500;700&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
