"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Search, Command } from "lucide-react";
import {
  LayoutDashboard,
  CalendarCheck,
  Megaphone,
  MapPin,
  Users,
  Mail,
  FlaskConical,
  FileText,
  Settings,
  Activity,
  ShieldBan,
} from "lucide-react";
import { clsx } from "clsx";

/* ── Page definitions ─────────────────────────────────────────────── */

const pages = [
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

/* ── Types ────────────────────────────────────────────────────────── */

interface LeadResult {
  id: number;
  name: string;
  city?: string | null;
  status?: string;
}

interface ResultItem {
  id: string;
  label: string;
  group: "pages" | "leads";
  href: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  sub?: string;
}

/* ── Component ────────────────────────────────────────────────────── */

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [leadResults, setLeadResults] = useState<LeadResult[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Open / close ───────────────────────────────────────────────── */

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setLeadResults([]);
      // Focus input on next tick
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  /* ── Search leads with debounce ─────────────────────────────────── */

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLeadResults([]);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setLoadingLeads(true);
      try {
        const res = await fetch(
          `/api/leads?search=${encodeURIComponent(trimmed)}&limit=5`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setLeadResults(data.leads ?? []);
        }
      } catch {
        // Aborted or network error — ignore
      } finally {
        if (!controller.signal.aborted) {
          setLoadingLeads(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  /* ── Filtered results ───────────────────────────────────────────── */

  const results: ResultItem[] = useMemo(() => {
    const items: ResultItem[] = [];
    const q = query.trim().toLowerCase();

    // Filter pages
    const matchedPages = q
      ? pages.filter((p) => p.label.toLowerCase().includes(q))
      : pages;

    for (const p of matchedPages) {
      items.push({
        id: `page-${p.href}`,
        label: p.label,
        group: "pages",
        href: p.href,
        icon: p.icon,
      });
    }

    // Add leads
    for (const lead of leadResults) {
      items.push({
        id: `lead-${lead.id}`,
        label: lead.name,
        group: "leads",
        href: `/leads?search=${encodeURIComponent(lead.name)}`,
        sub: [lead.city, lead.status?.toUpperCase()].filter(Boolean).join(" · "),
      });
    }

    return items;
  }, [query, leadResults]);

  // Clamp active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [results.length]);

  /* ── Navigate ───────────────────────────────────────────────────── */

  const navigate = useCallback(
    (item: ResultItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  /* ── Keyboard navigation ────────────────────────────────────────── */

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => (prev + 1) % Math.max(results.length, 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) =>
        prev <= 0 ? Math.max(results.length - 1, 0) : prev - 1
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) navigate(item);
      return;
    }
  }

  /* ── Scroll active item into view ───────────────────────────────── */

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  /* ── Render ─────────────────────────────────────────────────────── */

  if (!open) return null;

  // Group items for rendering
  const pageItems = results.filter((r) => r.group === "pages");
  const leadItems = results.filter((r) => r.group === "leads");

  // Track flat index for highlighting
  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[cmdFadeIn_120ms_ease-out]"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-md mx-4 bg-bg-secondary border border-border-light rounded-[12px] overflow-hidden shadow-none animate-[cmdSlideIn_120ms_ease-out]"
        onKeyDown={onKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-text-muted flex-shrink-0" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar paginas, leads..."
            className="flex-1 bg-transparent text-[13px] text-text-primary font-mono placeholder:text-text-muted/60 outline-none"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border text-[10px] text-text-muted font-mono">
            <span className="text-[9px]">ESC</span>
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-2">
          {results.length === 0 && query.trim().length > 0 && !loadingLeads && (
            <p className="px-4 py-6 text-center text-[11px] text-text-muted font-mono uppercase tracking-[0.06em]">
              [SIN RESULTADOS]
            </p>
          )}

          {/* Pages group */}
          {pageItems.length > 0 && (
            <div>
              <p className="px-4 pt-2 pb-1 text-[10px] text-text-muted font-mono uppercase tracking-[0.1em]">
                Paginas
              </p>
              {pageItems.map((item) => {
                const idx = flatIdx++;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    data-active={idx === activeIdx}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer transition-colors duration-75",
                      idx === activeIdx
                        ? "bg-bg-tertiary text-text-display"
                        : "text-text-secondary hover:bg-bg-tertiary/50"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={clsx(
                          "h-[15px] w-[15px] flex-shrink-0",
                          idx === activeIdx ? "text-accent" : "text-text-muted"
                        )}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="text-[11px] font-mono tracking-[0.06em] uppercase">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Leads group */}
          {(leadItems.length > 0 || loadingLeads) && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] text-text-muted font-mono uppercase tracking-[0.1em]">
                Leads
              </p>
              {loadingLeads && leadItems.length === 0 && (
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-[2px]">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1 h-1 bg-text-muted animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-text-muted font-mono uppercase tracking-[0.06em]">
                    Buscando...
                  </span>
                </div>
              )}
              {leadItems.map((item) => {
                const idx = flatIdx++;
                return (
                  <button
                    key={item.id}
                    data-active={idx === activeIdx}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer transition-colors duration-75",
                      idx === activeIdx
                        ? "bg-bg-tertiary text-text-display"
                        : "text-text-secondary hover:bg-bg-tertiary/50"
                    )}
                  >
                    <Users
                      className={clsx(
                        "h-[15px] w-[15px] flex-shrink-0",
                        idx === activeIdx ? "text-accent" : "text-text-muted"
                      )}
                      strokeWidth={1.5}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-mono tracking-[0.04em] truncate block">
                        {item.label}
                      </span>
                      {item.sub && (
                        <span className="text-[10px] text-text-muted font-mono truncate block">
                          {item.sub}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono">
            <kbd className="px-1 py-0.5 rounded border border-border text-[9px]">&uarr;&darr;</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono">
            <kbd className="px-1 py-0.5 rounded border border-border text-[9px]">&#9166;</kbd>
            abrir
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-text-muted font-mono">
            <Command className="h-3 w-3" strokeWidth={1.5} />
            <span>K</span>
          </span>
        </div>
      </div>

      {/* Keyframe animations injected via style tag */}
      <style>{`
        @keyframes cmdFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmdSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
