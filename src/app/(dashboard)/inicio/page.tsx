"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Card, Spinner, ValueChip } from "@/components/ui";
import { CampaignSelector } from "@/components/CampaignSelector";
import { useCampaign } from "@/components/CampaignProvider";
import { INTENT_TONE, isReplyIntent } from "@/lib/reply-intent";
import { AreaTrend, RadialGauge, Donut, BarWeek, CHART_COLORS, DONUT_COLORS } from "@/components/charts/Charts";
import {
  Inbox,
  MessageSquare,
  Send,
  AlertTriangle,
  PauseCircle,
  CheckCircle2,
  Mail,
  MessageCircle,
  ArrowRight,
  Building2,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

// ─── Types ──────────────────────────────────────────────────────────

interface SampleRow {
  channel: "email" | "whatsapp";
  id: number;
  leadId: number | null;
  leadName: string | null;
  leadCity: string | null;
  campaignName: string | null;
  preview: string | null;
  createdAt: string | null;
  sentAt: string | null;
}
interface ReplyRow {
  id: number;
  leadId: number | null;
  leadName: string | null;
  channel: string;
  fromAddress: string | null;
  body: string;
  status: string;
  intent: string | null;
  receivedAt: string | null;
}
interface DashboardData {
  totalLeads: number;
  sentToday: number;
  waSentToday: number;
  totalSent: number;
  activeCampaigns: number;
  globalDailyLimit: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate7d: number;
  emailsByDay: { date: string; count: number }[];
  waSentByDay: { date: string; count: number }[];
  qualityDist: { range: string; count: number }[];
  topCities: { city: string | null; count: number }[];
  statusCounts: { status: string; count: number }[];
  samples: {
    pending: SampleRow[];
    approved: SampleRow[];
    sentToday: SampleRow[];
    recentReplies: ReplyRow[];
    counts: { pending: number; approved: number; sentToday: number; repliesRecent: number; repliesUnread: number; failed: number };
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function lastNDays(n: number) {
  const out: { date: string; label: string }[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    out.push({ date: iso, label: dt.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "") });
  }
  return out;
}

function fmtTime(s?: string | null): string {
  if (!s) return "";
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

const INTENT_BADGE_CLASS: Record<"good" | "warn" | "muted", string> = {
  good: "border-success/40 text-success bg-success-subtle",
  warn: "border-accent/40 text-accent bg-accent-subtle",
  muted: "border-border-visible text-text-secondary bg-surface-raised",
};

// Collapse the 18-value lead lifecycle into a readable funnel.
function buildPipeline(statusCounts: { status: string; count: number }[]) {
  const m = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]));
  const sum = (...keys: string[]) => keys.reduce((a, k) => a + (m[k] ?? 0), 0);
  return [
    { label: "Importados", value: sum("imported", "queued", "scraping", "scraped") },
    { label: "Analizados", value: sum("analyzing", "analyzed") },
    { label: "Redactados", value: sum("email_generated", "wa_generated", "email_approved", "wa_approved") },
    { label: "Enviados", value: sum("email_sent", "wa_sent", "contacted") },
    { label: "Respuestas", value: sum("replied"), accent: true },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────

function ChannelGlyph({ channel }: { channel: string }) {
  return channel === "whatsapp" ? (
    <MessageCircle className="w-3 h-3 text-text-muted shrink-0" strokeWidth={1.5} />
  ) : (
    <Mail className="w-3 h-3 text-text-muted shrink-0" strokeWidth={1.5} />
  );
}

function SampleList({
  label,
  count,
  rows,
  dotClass,
  timeKey,
  href,
  cta,
}: {
  label: string;
  count: number;
  rows: SampleRow[];
  dotClass: string;
  timeKey: "createdAt" | "sentAt";
  href: string;
  cta: string;
}) {
  return (
    <Card dots className="h-full nd-enter flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <span className="nd-label">{label}</span>
        <span className="text-[20px] font-mono font-light tabular-nums text-text-display">{count}</span>
      </div>
      <div className="flex-1 space-y-0.5">
        {rows.length === 0 ? (
          <p className="text-[11px] text-text-muted py-6 text-center">Sin elementos</p>
        ) : (
          rows.slice(0, 4).map((r) => (
            <div key={`${r.channel}-${r.id}`} className="flex items-center gap-2 py-1.5 border-t border-border first:border-t-0">
              <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ChannelGlyph channel={r.channel} />
                  <span className="text-[12px] text-text-primary truncate">{r.leadName ?? "—"}</span>
                </div>
                {r.preview && (
                  <p className="text-[10.5px] text-text-muted truncate mt-0.5 pl-[18px]">{r.preview}</p>
                )}
              </div>
              <span className="text-[10px] font-mono text-text-muted shrink-0">
                {r.leadCity || fmtTime(r[timeKey])}
              </span>
            </div>
          ))
        )}
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.08em] text-accent hover:gap-1.5 transition-all"
      >
        {cta} <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
      </Link>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function InicioPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useT();
  const { selectedId, selected } = useCampaign();

  const fetchData = useCallback(async () => {
    try {
      const qs = selectedId != null ? `?campaignId=${selectedId}` : "";
      const res = await fetch(`/api/dashboard${qs}`);
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const samples = data?.samples;
  const counts = samples?.counts ?? { pending: 0, approved: 0, sentToday: 0, repliesRecent: 0, repliesUnread: 0, failed: 0 };
  const sendingPaused = (data?.bounceRate7d ?? 0) >= 5;

  // "Necesitas tú" — the few things that need a human.
  const needs: { key: string; label: string; icon: typeof Inbox; tone: "accent" | "warn" | "muted"; href: string }[] = [];
  if (counts.pending > 0)
    needs.push({ key: "pending", label: `${counts.pending} por aprobar`, icon: Inbox, tone: "accent", href: "/review" });
  if (counts.repliesUnread > 0)
    needs.push({ key: "replies", label: `${counts.repliesUnread} respuestas`, icon: MessageSquare, tone: "accent", href: "/review" });
  if (counts.failed > 0)
    needs.push({ key: "failed", label: `${counts.failed} fallidos`, icon: AlertTriangle, tone: "warn", href: "/review" });
  if (sendingPaused)
    needs.push({ key: "paused", label: `Envío en pausa · rebote ${data?.bounceRate7d}%`, icon: PauseCircle, tone: "warn", href: "/settings" });

  const pipeline = buildPipeline(data?.statusCounts ?? []);
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.value));

  // Activity series (last 7 days)
  const days = lastNDays(7);
  const emailMap = Object.fromEntries((data?.emailsByDay ?? []).map((d) => [d.date, d.count]));
  const waMap = Object.fromEntries((data?.waSentByDay ?? []).map((d) => [d.date, d.count]));
  const activity = days.map((d) => ({ label: d.label, emails: emailMap[d.date] ?? 0, whatsapp: waMap[d.date] ?? 0 }));
  const latestEmails = activity.length ? activity[activity.length - 1].emails : 0;
  const latestWa = activity.length ? activity[activity.length - 1].whatsapp : 0;
  const weekly = days.map((d) => ({ label: d.label, value: (emailMap[d.date] ?? 0) + (waMap[d.date] ?? 0) }));
  const peakIdx = weekly.reduce((mi, d, i, arr) => (d.value > arr[mi].value ? i : mi), 0);
  const weeklyBars = weekly.map((d, i) => ({ ...d, active: i === peakIdx }));

  const qualityData = (data?.qualityDist ?? []).map((d) => ({ name: d.range, value: d.count })).filter((d) => d.value > 0);
  const cityData = (data?.topCities ?? []).filter((c) => c.city).slice(0, 6).map((c) => ({ label: c.city as string, value: c.count }));

  const sentTodayTotal = (data?.sentToday ?? 0) + (data?.waSentToday ?? 0);
  const dailyLimit = data?.globalDailyLimit ?? 0;
  const sendPct = dailyLimit > 0 ? Math.min(100, Math.round((sentTodayTotal / dailyLimit) * 100)) : 0;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("home.title")}</h1>
          <p className="nd-label mt-2">{selected ? selected.name : t("home.subtitle") || "Todas las campañas"}</p>
        </div>
        <div className="flex items-center gap-3">
          <CampaignSelector />
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success nd-pulse" />
            {t("home.live") || "en vivo"}
          </span>
        </div>
      </div>

      {/* Necesitas tú */}
      <div className="nd-section">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="nd-label text-text-muted mr-1">Necesitas tú</span>
          {needs.length === 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-subtle px-3 py-1.5 text-[12px] text-success">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Todo al día
            </span>
          ) : (
            needs.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                  n.tone === "accent" && "border-accent/40 bg-accent-subtle text-accent hover:border-accent",
                  n.tone === "warn" && "border-border-visible bg-surface-raised text-text-primary hover:border-accent/40",
                  n.tone === "muted" && "border-border-visible bg-surface-raised text-text-secondary"
                )}
              >
                <n.icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {n.label}
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="nd-section">
        <Card dots title={t("home.pipeline") || "Pipeline"} meta={`${data?.totalLeads ?? 0} leads`} className="nd-enter">
          <div className="flex items-stretch gap-1 sm:gap-2 mt-1">
            {pipeline.map((stage, i) => (
              <div key={stage.label} className="flex items-end flex-1 min-w-0">
                <div className="flex-1 min-w-0 text-center">
                  <div
                    className={clsx(
                      "text-[22px] sm:text-[26px] font-mono font-light tabular-nums leading-none",
                      stage.accent ? "text-success" : "text-text-display"
                    )}
                  >
                    {stage.value}
                  </div>
                  <div className="nd-label mt-2 truncate">{stage.label}</div>
                  <div className="mt-2 h-1 rounded-full bg-border/60 overflow-hidden mx-auto max-w-[80%]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(stage.value / pipelineMax) * 100}%`, background: stage.accent ? "var(--success)" : "var(--accent)" }}
                    />
                  </div>
                </div>
                {i < pipeline.length - 1 && <ChevronRight className="w-4 h-4 text-text-muted/50 shrink-0 mb-5" strokeWidth={1.5} />}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sample columns: pending / approved / sent today */}
      <div className="nd-section grid grid-cols-1 md:grid-cols-3 gap-4">
        <SampleList
          label={t("home.pending") || "Pendientes"}
          count={counts.pending}
          rows={samples?.pending ?? []}
          dotClass="bg-text-disabled"
          timeKey="createdAt"
          href="/review"
          cta="Ver en Review"
        />
        <SampleList
          label={t("home.approved") || "Aprobados"}
          count={counts.approved}
          rows={samples?.approved ?? []}
          dotClass="bg-accent"
          timeKey="createdAt"
          href="/review"
          cta="En cola de envío"
        />
        <SampleList
          label={t("home.sentToday") || "Enviados hoy"}
          count={counts.sentToday}
          rows={samples?.sentToday ?? []}
          dotClass="bg-success"
          timeKey="sentAt"
          href="/review"
          cta="Ver todos"
        />
      </div>

      {/* Replies monitor + Send health */}
      <div className="nd-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          dots
          title={t("home.replies") || "Respuestas"}
          meta={
            counts.repliesUnread > 0
              ? `${counts.repliesUnread} sin leer`
              : counts.repliesRecent > 0
              ? `${counts.repliesRecent} · 7d`
              : undefined
          }
          className="lg:col-span-2 nd-enter"
        >
          {(samples?.recentReplies?.length ?? 0) === 0 ? (
            <p className="text-[12px] text-text-muted py-10 text-center">{t("home.noReplies") || "Aún no hay respuestas"}</p>
          ) : (
            <div className="space-y-0.5">
              {samples!.recentReplies.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 py-2 border-t border-border first:border-t-0">
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {r.status === "unread" && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    <ChannelGlyph channel={r.channel} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-[12px] truncate", r.status === "unread" ? "text-text-display font-medium" : "text-text-primary")}>
                        {r.leadName || r.fromAddress || "—"}
                      </span>
                      {isReplyIntent(r.intent) && (
                        <span className={clsx("shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.06em]", INTENT_BADGE_CLASS[INTENT_TONE[r.intent]])}>
                          {t(`intent.${r.intent}`)}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-text-muted shrink-0 ml-auto">{fmtTime(r.receivedAt)}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">{r.body}</p>
                  </div>
                </div>
              ))}
              <Link
                href="/review"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.08em] text-accent hover:gap-1.5 transition-all"
              >
                Ir a respuestas <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            </div>
          )}
        </Card>

        <Card title={t("home.sendHealth") || "Salud de envío"} className="nd-enter">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[24px] font-mono font-light tabular-nums text-text-display">{sentTodayTotal}</span>
            <span className="text-[12px] text-text-muted">/ {dailyLimit} hoy</span>
          </div>
          <div className="mt-2.5 mb-4 h-1.5 rounded-full bg-surface-raised overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${sendPct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-border">
            {[
              { v: `${data?.openRate ?? 0}%`, l: t("home.openRate") || "Abierto" },
              { v: `${data?.clickRate ?? 0}%`, l: t("home.clickRate") || "Clic" },
              { v: `${data?.replyRate ?? 0}%`, l: t("home.replyRate") || "Resp." },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-[16px] font-mono font-light tabular-nums text-text-display">{s.v}</div>
                <div className="nd-label mt-1">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-text-muted">{t("home.bounce") || "Rebote 7d"}</span>
            <span className={clsx("font-mono tabular-nums", sendingPaused ? "text-accent" : "text-text-display")}>
              {data?.bounceRate7d ?? 0}%
            </span>
          </div>
        </Card>
      </div>

      {/* Activity + engagement */}
      <div className="nd-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card dots title={t("home.activity")} meta={t("home.last7")} className="lg:col-span-2 nd-enter">
          <div className="flex items-center gap-2.5 mb-4 -mt-1">
            <ValueChip color={CHART_COLORS.orange}>Emails <span className="text-text-muted">·</span> {latestEmails}</ValueChip>
            <ValueChip color={CHART_COLORS.gray}>WhatsApp <span className="text-text-muted">·</span> {latestWa}</ValueChip>
          </div>
          <AreaTrend
            data={activity}
            series={[
              { key: "emails", label: "Emails", color: CHART_COLORS.orange },
              { key: "whatsapp", label: "WhatsApp", color: CHART_COLORS.gray },
            ]}
            height={200}
          />
        </Card>

        <Card title={t("home.engagement")} className="nd-enter">
          <div className="grid grid-cols-3 gap-2 pt-1">
            <RadialGauge value={data?.openRate ?? 0} label={t("home.openRate")} color={CHART_COLORS.orange} size={92} />
            <RadialGauge value={data?.clickRate ?? 0} label={t("home.clickRate")} color={CHART_COLORS.orangeSoft} size={92} />
            <RadialGauge value={data?.replyRate ?? 0} label={t("home.replyRate")} color={CHART_COLORS.gray} size={92} />
          </div>
          <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-[20px] font-mono font-light tabular-nums text-text-display">{data?.totalSent ?? 0}</div>
              <div className="nd-label mt-1">{t("home.totalSent")}</div>
            </div>
            <div>
              <div className="text-[20px] font-mono font-light tabular-nums text-text-display">{data?.activeCampaigns ?? 0}</div>
              <div className="nd-label mt-1">{t("home.activeCampaigns")}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Weekly sends + quality + cities */}
      <div className="nd-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card dots title={t("home.weeklySends")} meta={`${weekly[weekly.length - 1]?.value ?? 0} ${t("home.today")}`} className="nd-enter">
          <div className="flex items-center gap-2 mb-3 text-text-muted">
            <BarChart3 className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-mono">{weekly.reduce((s, d) => s + d.value, 0)} {t("home.thisWeek")}</span>
          </div>
          <BarWeek data={weeklyBars} color={CHART_COLORS.orange} height={180} />
        </Card>

        <Card dots title={t("home.quality")} className="nd-enter">
          {qualityData.length ? (
            <>
              <Donut data={qualityData} height={150} centerValue={data?.totalLeads ?? 0} centerLabel={t("home.leads")} />
              <div className="mt-3 space-y-1.5">
                {qualityData.slice(0, 4).map((q, i) => (
                  <div key={q.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="text-text-secondary truncate flex-1">{q.name}</span>
                    <span className="font-mono tabular-nums text-text-display">{q.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-text-muted py-10 text-center">{t("home.noData")}</p>
          )}
        </Card>

        <Card title={t("home.topCities")} className="nd-enter">
          <div className="flex items-center gap-2 mb-4 text-text-muted">
            <Building2 className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-mono">{data?.totalLeads ?? 0} leads</span>
          </div>
          {cityData.length ? (
            <div className="space-y-1.5">
              {cityData.map((c, i) => {
                const max = Math.max(1, ...cityData.map((x) => x.value));
                return (
                  <div key={c.label} className="nd-row">
                    <span className="nd-label text-text-muted/60 tabular-nums w-5">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[12px] text-text-primary truncate flex-1">{c.label}</span>
                    <div className="w-16 h-1.5 rounded-full bg-border/60 overflow-hidden hidden sm:block">
                      <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, background: CHART_COLORS.orange }} />
                    </div>
                    <span className="text-[12px] font-mono tabular-nums text-text-display w-7 text-right">{c.value}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-text-muted py-10 text-center">{t("home.noData")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
