"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/", label: "DASHBOARD", icon: LayoutDashboard },
  { href: "/today", label: "HOY", icon: CalendarCheck },
  { href: "/campaigns", label: "CAMPANAS", icon: Megaphone },
  { href: "/search", label: "BUSCAR", icon: MapPin },
  { href: "/leads", label: "LEADS", icon: Users },
  { href: "/review", label: "REVISION", icon: Mail },
  { href: "/ab-testing", label: "A/B TESTING", icon: FlaskConical },
  { href: "/templates", label: "TEMPLATES", icon: FileText },
  { href: "/settings", label: "CONFIG", icon: Settings },
  { href: "/activity", label: "ACTIVIDAD", icon: Activity },
  { href: "/blacklist", label: "BLACKLIST", icon: ShieldBan },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-bg-secondary border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
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
      <div className="px-5 py-4 border-t border-border">
        <a
          href="https://vanguardia.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-text-muted font-mono uppercase tracking-[0.1em] hover:text-text-secondary transition-colors duration-150"
        >
          vanguardia.dev
        </a>
      </div>
    </aside>
  );
}
