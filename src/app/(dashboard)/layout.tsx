import { Sidebar } from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="px-10 py-8 max-w-[1440px]">{children}</div>
      </main>
    </>
  );
}
