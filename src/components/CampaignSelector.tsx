"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Layers } from "lucide-react";
import { clsx } from "clsx";
import { useCampaign } from "./CampaignProvider";

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  paused: "bg-accent",
  archived: "bg-text-disabled",
};

// The global campaign scope picker, shown in page headers (dashboard, Review).
// "All campaigns" + one entry per campaign. Selection is persisted by the provider.
export function CampaignSelector({ className }: { className?: string }) {
  const { campaigns, selectedId, setSelectedId, selected } = useCampaign();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const label = selected ? selected.name : "Todas las campañas";

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-border-visible bg-surface-raised px-3 py-1.5 text-[12px] text-text-primary hover:border-accent/40 transition-colors cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={clsx("w-1.5 h-1.5 rounded-full", selected ? STATUS_DOT[selected.status] ?? "bg-accent" : "bg-accent")} />
        <span className="max-w-[200px] truncate font-medium">{label}</span>
        <ChevronDown className={clsx("w-3.5 h-3.5 text-text-muted transition-transform", open && "rotate-180")} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-[90] mt-2 left-0 min-w-[240px] max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg-secondary shadow-2xl shadow-black/40 p-1.5"
        >
          <button
            onClick={() => {
              setSelectedId(null);
              setOpen(false);
            }}
            className={clsx(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] cursor-pointer transition-colors",
              selectedId == null ? "bg-bg-tertiary text-text-display" : "text-text-secondary hover:bg-bg-tertiary/60"
            )}
          >
            <Layers className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-left">Todas las campañas</span>
            {selectedId == null && <Check className="w-3.5 h-3.5 text-accent" strokeWidth={2} />}
          </button>

          {campaigns.length > 0 && <div className="my-1 border-t border-border" />}

          {campaigns.map((c) => {
            const active = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setOpen(false);
                }}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] cursor-pointer transition-colors",
                  active ? "bg-bg-tertiary text-text-display" : "text-text-secondary hover:bg-bg-tertiary/60"
                )}
              >
                <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[c.status] ?? "bg-text-disabled")} />
                <span className="flex-1 text-left truncate">{c.name}</span>
                <span className="font-mono uppercase tracking-[0.1em] text-[9px] text-text-muted">{c.channels}</span>
                {active && <Check className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2} />}
              </button>
            );
          })}

          {campaigns.length === 0 && (
            <p className="px-2.5 py-3 text-[11px] text-text-muted text-center">Aún no hay campañas</p>
          )}
        </div>
      )}
    </div>
  );
}
