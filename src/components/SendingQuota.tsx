"use client";

import { useEffect, useState } from "react";
import { Mail, Briefcase } from "lucide-react";
import { clsx } from "clsx";
import { WhatsAppIcon } from "@/components/icons/Brands";
import { useT } from "@/i18n/LocaleProvider";

interface ChannelQuota {
  limit: number;
  sent: number;
  remaining: number;
  warmup: { day: number; max: number; complete: boolean } | null;
}

interface Quota {
  window: { start: number; end: number; within: boolean };
  email: ChannelQuota & { paused: boolean };
  whatsapp: ChannelQuota & { connected: boolean };
  workana: {
    weeklyLimit: number;
    submitted: number;
    remaining: number;
    pending: number;
    allowSubmit: boolean;
  } | null;
}

function usedPct(sent: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((sent / limit) * 100)));
}

// One channel row: icon + label, "remaining / limit", a thin usage bar and an
// optional status note (warm-up day, paused, disconnected, off-hours).
function QuotaRow({
  icon,
  label,
  remaining,
  limit,
  pct,
  note,
  idle = false,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  remaining: number;
  limit: number;
  pct: number;
  note?: string | null;
  idle?: boolean;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted [&>svg]:h-3 [&>svg]:w-3 [&>svg]:flex-shrink-0">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums whitespace-nowrap">
          <span className={clsx(remaining > 0 && !idle ? "text-text-display" : "text-text-muted")}>{remaining}</span>
          <span className="text-text-muted/60">
            {" / "}
            {limit}
            {suffix ? <span className="text-[9px]"> {suffix}</span> : null}
          </span>
        </span>
      </div>
      <div className={clsx("h-1 rounded-full overflow-hidden", idle ? "bg-border/60 nd-hatch" : "bg-border")}>
        {!idle && (
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {note ? (
        <p className="text-[9px] font-mono uppercase tracking-[0.1em] text-text-muted/70 leading-tight">{note}</p>
      ) : null}
    </div>
  );
}

export function SendingQuota() {
  const { t } = useT();
  const [q, setQ] = useState<Quota | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/quota")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setQ(d as Quota);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!q) return null;

  const offHours = !q.window.within ? t("quota.offHours", { start: String(q.window.start), end: String(q.window.end) }) : null;

  const emailNote = q.email.paused
    ? t("quota.paused")
    : offHours ?? (q.email.warmup && !q.email.warmup.complete ? t("quota.warmupDay", { day: String(q.email.warmup.day) }) : null);

  const waNote = !q.whatsapp.connected
    ? t("quota.notConnected")
    : offHours ?? (q.whatsapp.warmup && !q.whatsapp.warmup.complete ? t("quota.warmupDay", { day: String(q.whatsapp.warmup.day) }) : null);

  return (
    <div className="px-5 py-4 border-t border-border space-y-3.5">
      <p className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-muted/70">{t("quota.title")}</p>

      <QuotaRow
        icon={<Mail strokeWidth={1.5} />}
        label={t("quota.email")}
        remaining={q.email.remaining}
        limit={q.email.limit}
        pct={usedPct(q.email.sent, q.email.limit)}
        note={emailNote}
      />

      <QuotaRow
        icon={<WhatsAppIcon size={12} />}
        label={t("quota.whatsapp")}
        remaining={q.whatsapp.remaining}
        limit={q.whatsapp.limit}
        pct={usedPct(q.whatsapp.sent, q.whatsapp.limit)}
        note={waNote}
        idle={!q.whatsapp.connected}
      />

      {q.workana ? (
        <QuotaRow
          icon={<Briefcase strokeWidth={1.5} />}
          label={t("quota.workana")}
          remaining={q.workana.remaining}
          limit={q.workana.weeklyLimit}
          pct={usedPct(q.workana.submitted, q.workana.weeklyLimit)}
          suffix={t("quota.perWeek")}
          note={
            !q.workana.allowSubmit
              ? t("quota.manualOnly")
              : q.workana.pending > 0
                ? t("quota.pendingApproval", { n: String(q.workana.pending) })
                : null
          }
        />
      ) : null}
    </div>
  );
}
