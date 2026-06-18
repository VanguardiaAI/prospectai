"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ChatbotProvider, useChatbot } from "@/components/ChatbotProvider";
import { CampaignProvider } from "@/components/CampaignProvider";
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

// Content column. When the chat is expanded to the right-side dock (desktop),
// make room for it so the agent and the page sit side by side instead of overlapping.
function ShellMain({ children }: { children: React.ReactNode }) {
  const { mode } = useChatbot();
  return (
    <main
      className={clsx(
        "relative lg:ml-60 min-h-screen transition-[margin] duration-300 ease-out",
        mode === "panel" && "lg:mr-[420px]"
      )}
    >
      {/* pb-28 leaves room for the always-present chat bar docked at the bottom.
          mx-auto + wider cap so content fills external monitors instead of
          hugging the sidebar with a dead band on the right. */}
      <div className="px-4 pt-16 pb-28 lg:px-10 lg:pt-8 lg:pb-28 max-w-[1600px] mx-auto">
        <TranslatedErrorBoundary>{children}</TranslatedErrorBoundary>
      </div>
    </main>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CampaignProvider>
      <ChatbotProvider>
        {/* Ambient gradient backdrop — what the glass surfaces refract */}
        <div className="nd-ambient" aria-hidden />
        <OnboardingGate />
        <Sidebar />
        <CommandPalette />
        <Chatbot />
        <ShellMain>{children}</ShellMain>
      </ChatbotProvider>
    </CampaignProvider>
  );
}
