import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <CommandPalette />
      <main className="lg:ml-60 min-h-screen">
        <div className="px-4 pt-16 pb-8 lg:px-10 lg:py-8 max-w-[1440px]">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </>
  );
}
