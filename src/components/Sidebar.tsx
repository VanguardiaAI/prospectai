"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Inbox,
  Settings,
  LogOut,
  Menu,
  X,
  Briefcase,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

export function Sidebar() {
  const { t } = useT();
  const [workanaEnabled, setWorkanaEnabled] = useState(false);

  const nav = [
    { href: "/inicio", label: t("sidebar.home"), icon: Home },
    { href: "/review", label: t("sidebar.review"), icon: Inbox },
    ...(workanaEnabled ? [{ href: "/workana", label: t("sidebar.workana"), icon: Briefcase }] : []),
    { href: "/settings", label: t("sidebar.config"), icon: Settings },
  ];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Unread-reply badge on the Review item — replies are now a first-class inbox.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/replies?status=unread&limit=50")
        .then((r) => (r.ok ? r.json() : { replies: [] }))
        .then((d) => {
          if (!cancelled) setUnreadReplies(Array.isArray(d?.replies) ? d.replies.length : 0);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [pathname]);

  // Workana is an opt-in add-on: only show its nav entry when enabled.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setWorkanaEnabled(d.workana_enabled === "true");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-[60] lg:hidden p-2 rounded-lg bg-bg-secondary border border-border"
        aria-label={t("sidebar.openMenu")}
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
          "fixed left-0 top-0 h-full w-60 border-r border-border flex flex-col z-[70]",
          "bg-bg-primary",
          "transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo + close button on mobile */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group/logo">
            <div className="w-7 h-7 rounded-full border border-border-light flex items-center justify-center transition-colors duration-200 group-hover/logo:border-accent/60">
              <div className="w-1.5 h-1.5 rounded-full bg-accent nd-pulse" />
            </div>
            <div>
              <h1 className="text-[12px] font-medium text-text-display tracking-[0.06em] font-mono uppercase">
                ProspectAI
              </h1>
              <p className="text-[9px] text-text-muted font-mono uppercase tracking-[0.12em]">
                open source
              </p>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1 rounded text-text-muted hover:text-text-primary"
            aria-label={t("sidebar.closeMenu")}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 overflow-y-auto">
          <p className="px-3 mb-2 text-[9px] font-mono uppercase tracking-[0.16em] text-text-muted/70">
            {t("sidebar.menu")}
          </p>
          <div className="space-y-0.5">
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "sidebar-link group/nav relative flex items-center gap-3 px-3 py-2 rounded-lg",
                    "text-[11px] font-mono tracking-[0.06em] uppercase",
                    isActive
                      ? "text-text-display bg-bg-tertiary border-l-2 border-accent -ml-[2px] pl-[14px] shadow-[var(--shadow-sm)] [&>svg]:text-accent"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50 [&>svg]:text-text-muted hover:[&>svg]:text-text-secondary"
                  )}
                >
                  <Icon className="h-[15px] w-[15px] flex-shrink-0 transition-colors duration-150" strokeWidth={1.5} />
                  {label}
                  {href === "/review" && unreadReplies > 0 ? (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-mono leading-none">
                      {unreadReplies > 9 ? "9+" : unreadReplies}
                    </span>
                  ) : (
                    isActive && <span className="ml-auto w-1 h-1 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border space-y-3">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="flex items-center gap-2 text-[10px] text-text-muted font-mono uppercase tracking-[0.06em] hover:text-accent transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="h-3 w-3" strokeWidth={1.5} />
            {t("sidebar.logout")}
          </button>
          <a
            href="https://github.com/VanguardiaAI/ProspectAI"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[9px] text-text-muted font-mono uppercase tracking-[0.1em] hover:text-text-secondary transition-colors duration-150"
          >
            github
          </a>
        </div>
      </aside>
    </>
  );
}
