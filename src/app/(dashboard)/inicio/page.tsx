"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Card, Spinner, DeltaBadge, ValueChip } from "@/components/ui";
import { AreaTrend, RadialGauge, Donut, BarWeek, CHART_COLORS, DONUT_COLORS } from "@/components/charts/Charts";
import { Inbox, MessageSquare, Send, Clock, Settings, Sparkles, Building2, BarChart3 } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

interface DashboardData {
  totalLeads: number;
  analyzed: number;
  sentToday: number;
  pendingReview: number;
  pendingJobs: number;
  totalReplied: number;
  totalSent: number;
  activeCampaigns: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  emailsByDay: { date: string; count: number }[];
  waSentByDay: { date: string; count: number }[];
  qualityDist: { range: string; count: number }[];
  topCities: { city: string | null; count: number }[];
  statusCounts: { status: string; count: number }[];
  waReplies: number;
  waPendingReview: number;
  waSentToday: number;
}

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

export default function InicioPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useT();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const pendingReview = (data?.pendingReview ?? 0) + (data?.waPendingReview ?? 0);
  const replies = (data?.totalReplied ?? 0) + (data?.waReplies ?? 0);
  const sentToday = (data?.sentToday ?? 0) + (data?.waSentToday ?? 0);
  const inQueue = data?.pendingJobs ?? 0;

  const kpis = [
    { key: "pendingReview", label: t("home.pendingReview"), value: pendingReview, icon: Inbox, color: "accent" },
    { key: "replies", label: t("home.replies"), value: replies, icon: MessageSquare, color: "accent" },
    { key: "sentToday", label: t("home.sentToday"), value: sentToday, icon: Send, color: "accent" },
    { key: "inQueue", label: t("home.inQueue"), value: inQueue, icon: Clock, color: "default" },
  ];

  // Activity series (last 7 days)
  const days = lastNDays(7);
  const emailMap = Object.fromEntries((data?.emailsByDay ?? []).map((d) => [d.date, d.count]));
  const waMap = Object.fromEntries((data?.waSentByDay ?? []).map((d) => [d.date, d.count]));
  const activity = days.map((d) => ({
    label: d.label,
    emails: emailMap[d.date] ?? 0,
    whatsapp: waMap[d.date] ?? 0,
  }));
  const latestEmails = activity.length ? activity[activity.length - 1].emails : 0;
  const latestWa = activity.length ? activity[activity.length - 1].whatsapp : 0;

  // Weekly sends bar data (idle bars hatched, peak day highlighted)
  const weekly = days.map((d) => ({ label: d.label, value: (emailMap[d.date] ?? 0) + (waMap[d.date] ?? 0) }));
  const peakIdx = weekly.reduce((mi, d, i, arr) => (d.value > arr[mi].value ? i : mi), 0);
  const weeklyBars = weekly.map((d, i) => ({ ...d, active: i === peakIdx }));

  // Honest delta for "sent today" vs yesterday
  const todayTotal = weekly[weekly.length - 1]?.value ?? 0;
  const ydayTotal = weekly[weekly.length - 2]?.value ?? 0;
  const sentDelta = ydayTotal > 0 ? Math.round(((todayTotal - ydayTotal) / ydayTotal) * 100) : null;

  const qualityData = (data?.qualityDist ?? [])
    .map((d) => ({ name: d.range, value: d.count }))
    .filter((d) => d.value > 0);

  const cityData = (data?.topCities ?? [])
    .filter((c) => c.city)
    .slice(0, 6)
    .map((c) => ({ label: c.city as string, value: c.count }));

  const iconColor: Record<string, string> = {
    accent: "text-accent",
    default: "text-text-muted",
  };
  const valueColor: Record<string, string> = {
    accent: "text-text-display",
    default: "text-text-display",
  };

  return (
    <div>
      <div className="nd-page-header">
        <div>
          <h1>{t("home.title")}</h1>
          <p className="nd-label mt-2">{t("home.subtitle")}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success nd-pulse" />
          {t("home.live")}
        </div>
      </div>

      {/* KPI row */}
      <div className="nd-section grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((m, i) => {
          const showDelta = m.key === "sentToday" && sentDelta !== null;
          return (
            <Link key={m.key} href="/review" className="block group">
              <Card dots interactive className={clsx("h-full nd-enter", `nd-stagger-${i + 1}`)}>
                <div className="flex items-start justify-between">
                  <span className={clsx(
                    "inline-flex items-center justify-center w-8 h-8 rounded-lg border",
                    m.color === "accent" ? "bg-accent-subtle border-accent/25" : "bg-surface-raised border-border",
                    iconColor[m.color]
                  )}>
                    <m.icon className="h-4 w-4 transition-colors" strokeWidth={1.5} />
                  </span>
                  {showDelta ? (
                    <DeltaBadge value={sentDelta as number} />
                  ) : (
                    <span className="nd-label text-text-muted/50 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  )}
                </div>
                <div className={clsx("text-[34px] font-light font-mono tracking-tight leading-none tabular-nums mt-4", valueColor[m.color])}>
                  {m.value}
                </div>
                <div className="nd-label mt-2">{m.label}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Activity + engagement */}
      <div className="nd-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card dots title={t("home.activity")} meta={t("home.last7")} className="lg:col-span-2 nd-enter nd-stagger-2">
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
            height={210}
          />
        </Card>

        <Card title={t("home.engagement")} className="nd-enter nd-stagger-3">
          <div className="grid grid-cols-3 gap-2 pt-1">
            <RadialGauge value={data?.openRate ?? 0} label={t("home.openRate")} color={CHART_COLORS.orange} size={96} />
            <RadialGauge value={data?.clickRate ?? 0} label={t("home.clickRate")} color={CHART_COLORS.orangeSoft} size={96} />
            <RadialGauge value={data?.replyRate ?? 0} label={t("home.replyRate")} color={CHART_COLORS.gray} size={96} />
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

      {/* Weekly sends + distribution + cities */}
      <div className="nd-section grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card dots title={t("home.weeklySends")} meta={`${todayTotal} ${t("home.today")}`} className="nd-enter nd-stagger-2">
          <div className="flex items-center gap-2 mb-3 text-text-muted">
            <BarChart3 className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[11px] font-mono">{weekly.reduce((s, d) => s + d.value, 0)} {t("home.thisWeek")}</span>
          </div>
          <BarWeek data={weeklyBars} color={CHART_COLORS.orange} height={190} />
        </Card>

        <Card dots title={t("home.quality")} className="nd-enter nd-stagger-3">
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

        <Card title={t("home.topCities")} className="nd-enter nd-stagger-4">
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

      {/* Shortcuts */}
      <div className="nd-section grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/review" className="block group">
          <Card interactive feature className="h-full nd-enter nd-stagger-4">
            <div className="flex items-start gap-3.5">
              <Inbox className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="text-sm font-medium mb-1 text-text-display">{t("home.reviewTitle")}</h3>
                <p className="text-[12px] text-text-secondary leading-relaxed">{t("home.reviewDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/settings" className="block group">
          <Card interactive className="h-full nd-enter nd-stagger-5">
            <div className="flex items-start gap-3.5">
              <Settings className="h-5 w-5 text-text-muted mt-0.5 flex-shrink-0 group-hover:text-text-secondary transition-colors" strokeWidth={1.5} />
              <div>
                <h3 className="text-sm font-medium mb-1 text-text-display">{t("home.settingsTitle")}</h3>
                <p className="text-[12px] text-text-secondary leading-relaxed">{t("home.settingsDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Card interactive feature className="h-full nd-enter nd-stagger-6">
          <div className="flex items-start gap-3.5">
            <Sparkles className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div>
              <h3 className="text-sm font-medium mb-1 text-text-display">{t("home.assistTitle")}</h3>
              <p className="text-[12px] text-text-secondary leading-relaxed">{t("home.assistDesc")}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
