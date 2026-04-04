import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono, Crimson_Pro } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

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
  title: "ProspectAI - Prospección Inteligente",
  description: "Automatiza la prospección de negocios para tu agencia web",
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
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
