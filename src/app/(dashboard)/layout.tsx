"use client";

import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <CommandPalette />
      <Chatbot />
      <main className="lg:ml-60 min-h-screen">
        <div className="px-4 pt-16 pb-8 lg:px-10 lg:py-8 max-w-[1440px]">
          <TranslatedErrorBoundary>{children}</TranslatedErrorBoundary>
        </div>
      </main>
    </>
  );
}
