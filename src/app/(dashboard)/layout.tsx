"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ChatbotProvider } from "@/components/ChatbotProvider";
import { Chatbot } from "@/components/Chatbot";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useT } from "@/i18n/LocaleProvider";

function TranslatedErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <ErrorBoundary
      errorTitle={t("error.title")}
      errorDescription={t("error.description")}
      retryLabel={t("error.retry")}
    >
      {children}
    </ErrorBoundary>
  );
}

function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    // Don't redirect from settings (user might be reconfiguring) or auth-related routes
    if (pathname?.startsWith("/settings")) return;
    let cancelled = false;
    fetch("/api/onboarding/profile")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.onboardingComplete) router.replace("/onboarding");
      })
      .catch(() => { /* silent — first run or backend hiccup */ });
    return () => { cancelled = true; };
  }, [pathname, router]);
  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChatbotProvider>
      {/* Ambient gradient backdrop — what the glass surfaces refract */}
      <div className="nd-ambient" aria-hidden />
      <OnboardingGate />
      <Sidebar />
      <CommandPalette />
      <Chatbot />
      <main className="relative lg:ml-60 min-h-screen">
        <div className="px-4 pt-16 pb-8 lg:px-10 lg:py-8 max-w-[1440px]">
          <TranslatedErrorBoundary>{children}</TranslatedErrorBoundary>
        </div>
      </main>
    </ChatbotProvider>
  );
}
