"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Mail,
  Megaphone,
  Settings,
  Activity,
  ShieldBan,
  MapPin,
  CalendarCheck,
  FlaskConical,
  FileText,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Kanban,
  Calendar,
} from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/", label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/today", label: "HOY", icon: CalendarCheck },
  { href: "/campaigns", label: "CAMPANAS", icon: Megaphone },
  { href: "/search", label: "BUSCAR", icon: MapPin },
  { href: "/leads", label: "LEADS", icon: Users },
  { href: "/pipeline", label: "PIPELINE", icon: Kanban },
  { href: "/review", label: "REVISION", icon: Mail },
  { href: "/ab-testing", label: "A/B TESTING", icon: FlaskConical },
  { href: "/templates", label: "TEMPLATES", icon: FileText },
  { href: "/settings", label: "CONFIG", icon: Settings },
  { href: "/activity", label: "ACTIVIDAD", icon: Activity },
  { href: "/calendar", label: "CALENDARIO", icon: Calendar },
  { href: "/blacklist", label: "BLACKLIST", icon: ShieldBan },
];

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial = stored || "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-[60] lg:hidden p-2 rounded-lg bg-bg-secondary border border-border"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5 text-text-primary" strokeWidth={1.5} />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed left-0 top-0 h-full w-60 bg-bg-secondary border-r border-border flex flex-col z-[70]",
          "transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo + close button on mobile */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full border border-border-light flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            </div>
            <div>
              <h1 className="text-[12px] font-medium text-text-display tracking-[0.06em] font-mono uppercase">
                ProspectAI
              </h1>
              <p className="text-[9px] text-text-muted font-mono uppercase tracking-[0.12em]">
                by VanguardIA
              </p>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1 rounded text-text-muted hover:text-text-primary"
            aria-label="Cerrar menu"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "sidebar-link flex items-center gap-3 px-3 py-2 rounded-lg",
                  "text-[11px] font-mono tracking-[0.06em] uppercase",
                  isActive
                    ? "text-text-display bg-bg-tertiary border-l-2 border-accent -ml-[2px] pl-[14px] [&>svg]:text-accent"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50 [&>svg]:text-text-muted"
                )}
              >
                <Icon className="h-[15px] w-[15px] flex-shrink-0" strokeWidth={1.5} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border space-y-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 text-[10px] text-text-muted font-mono uppercase tracking-[0.06em] hover:text-text-secondary transition-colors duration-150 cursor-pointer w-full"
          >
            <div className="relative w-9 h-[20px] rounded-full border border-border-light bg-transparent transition-colors duration-150">
              <div
                className={clsx(
                  "absolute top-[3px] w-3.5 h-3.5 rounded-full transition-transform duration-200 flex items-center justify-center",
                  theme === "dark"
                    ? "translate-x-[18px] bg-text-display"
                    : "translate-x-[3px] bg-text-muted"
                )}
              >
                {theme === "dark" ? (
                  <Moon className="h-2 w-2 text-bg-primary" strokeWidth={2} />
                ) : (
                  <Sun className="h-2 w-2 text-bg-primary" strokeWidth={2} />
                )}
              </div>
            </div>
            {theme === "dark" ? "Modo oscuro" : "Modo claro"}
          </button>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="flex items-center gap-2 text-[10px] text-text-muted font-mono uppercase tracking-[0.06em] hover:text-accent transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="h-3 w-3" strokeWidth={1.5} />
            Cerrar sesion
          </button>
          <a
            href="https://vanguardia.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[9px] text-text-muted font-mono uppercase tracking-[0.1em] hover:text-text-secondary transition-colors duration-150"
          >
            vanguardia.dev
          </a>
        </div>
      </aside>
    </>
  );
}
