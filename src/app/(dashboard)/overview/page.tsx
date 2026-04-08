"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Spinner, ProgressBar, MetricRing, ListRow } from "@/components/ui";
import { Users, BarChart3, Mail, Send, Clock, TrendingUp, Zap, Activity, ArrowUpRight, MessageCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useT } from "@/i18n/LocaleProvider";

interface DashboardData {
  totalLeads: number;
  analyzed: number;
  sentToday: number;
  globalDailyLimit: number;
  autopilotGlobal: boolean;
  pendingReview: number;
  totalSent: number;
  activeCampaigns: number;
  pendingJobs: number;
  statusCounts: { status: string; count: number }[];
  emailsByDay: { date: string; count: number }[];
  qualityDist: { range: string; count: number }[];
  topCities: { city: string; count: number }[];
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  totalBounced: number;
  bouncedToday: number;
  bounceRate7d: number;
  serviceStats: Record<string, { recommended: number; contacted: number }>;
  waSentToday: number;
  waTotalSent: number;
  waPendingReview: number;
  waDailyLimit: number;
  waReplies: number;
  waReplyRate: number;
  waSentByDay: { date: string; count: number }[];
}

function ClickableCard({ href, children, className, texture }: { href: string; children: React.ReactNode; className?: string; texture?: boolean }) {
  const router = useRouter();
  return (
    <Card
      className={`${className ?? ""} cursor-pointer transition-all duration-200 hover:border-accent/40 group`}
      texture={texture}
    >
      <div onClick={() => router.push(href)}>
        {children}
      </div>
      <ArrowUpRight className="absolute top-3 right-3 h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
    </Card>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useT();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
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

  if (!data) return null;

  const analysisPct = data.totalLeads > 0 ? Math.round((data.analyzed / data.totalLeads) * 100) : 0;
  const emailPct = data.globalDailyLimit > 0 ? Math.round((data.sentToday / data.globalDailyLimit) * 100) : 0;
  const maxCityCount = data.topCities.length > 0 ? data.topCities[0].count : 1;
  const maxStatusCount = data.statusCounts.length > 0 ? Math.max(...data.statusCounts.map(s => s.count)) : 1;

  const serviceNames: Record<string, string> = {
    web_development: t("services.web_development"),
    seo: t("services.seo"),
    ai_agents: t("services.ai_agents"),
    google_business: t("services.google_business"),
    social_media: t("services.social_media"),
  };

  return (
    <div>
      {/* Page Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("overview.title")}</h1>
          <p className="nd-label mt-2">{t("overview.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {data.autopilotGlobal && (
            <Badge color="success">{t("overview.autopilotOn")}</Badge>
          )}
          {data.pendingJobs > 0 && (
            <Badge>
              <Clock className="h-3 w-3 mr-1" strokeWidth={1.5} /> {data.pendingJobs} {t("common.jobs")}
            </Badge>
          )}
        </div>
      </div>

      {/* Bounce rate alerts */}
      {data.bounceRate7d >= 5 && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-mono">
          {t("overview.sendsPaused")} {data.bounceRate7d}%
        </div>
      )}
      {data.bounceRate7d >= 2 && data.bounceRate7d < 5 && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-sm font-mono">
          {t("overview.bounceWarning")} {data.bounceRate7d}%
        </div>
      )}

      {/* ─── Bento Row 1: Key Metrics ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        {/* Total Leads — tall card */}
        <ClickableCard href="/leads" className="col-span-12 md:col-span-3" texture>
          <div className="flex items-start justify-between">
            <div>
              <p className="nd-label mb-3">{t("overview.totalLeads")}</p>
              <p className="text-[36px] font-light font-mono tracking-tight leading-none text-text-display">
                {data.totalLeads.toLocaleString()}
              </p>
            </div>
            <div className="text-accent opacity-50">
              <Users className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-5">
            <ProgressBar
              value={data.analyzed}
              max={data.totalLeads}
              label={t("overview.analyzed")}
              color="success"
              size="sm"
            />
          </div>
        </ClickableCard>

        {/* Emails Hoy */}
        <ClickableCard href="/today" className="col-span-12 md:col-span-3" texture>
          <div className="flex items-start justify-between">
            <div>
              <p className="nd-label mb-3">{t("overview.emailsToday")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-light font-mono tracking-tight leading-none text-text-display">
                  {data.sentToday}
                </span>
                <span className="text-[14px] font-mono text-text-muted">/ {data.globalDailyLimit}</span>
              </div>
            </div>
            <div className={data.sentToday >= data.globalDailyLimit ? "text-warning" : "text-accent opacity-50"}>
              <Send className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-text-muted font-mono">
                {data.sentToday >= data.globalDailyLimit ? t("overview.limitReached") : t("overview.remaining", { count: data.globalDailyLimit - data.sentToday })}
              </span>
              <span className="text-[11px] text-text-display font-mono tabular-nums">{emailPct}%</span>
            </div>
            <div className="w-full h-[5px] bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${emailPct >= 100 ? "bg-warning" : "bg-accent"}`}
                style={{ width: `${Math.min(emailPct, 100)}%` }}
              />
            </div>
          </div>
        </ClickableCard>

        {/* WA Hoy */}
        <ClickableCard href="/review" className="col-span-12 md:col-span-3" texture>
          <div className="flex items-start justify-between">
            <div>
              <p className="nd-label mb-3">{t("overview.waToday")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-light font-mono tracking-tight leading-none text-text-display">
                  {data.waSentToday}
                </span>
                <span className="text-[14px] font-mono text-text-muted">/ {data.waDailyLimit}</span>
              </div>
            </div>
            <div className={data.waSentToday >= data.waDailyLimit ? "text-warning" : "text-green-500 opacity-50"}>
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-5">
            {(() => {
              const waPct = data.waDailyLimit > 0 ? Math.round((data.waSentToday / data.waDailyLimit) * 100) : 0;
              return (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-text-muted font-mono">
                      {data.waSentToday >= data.waDailyLimit ? t("overview.limitReached") : t("overview.remaining", { count: data.waDailyLimit - data.waSentToday })}
                    </span>
                    <span className="text-[11px] text-text-display font-mono tabular-nums">{waPct}%</span>
                  </div>
                  <div className="w-full h-[5px] bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${waPct >= 100 ? "bg-warning" : "bg-green-500"}`}
                      style={{ width: `${Math.min(waPct, 100)}%` }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        </ClickableCard>

        {/* Right column: two stacked small cards */}
        <div className="col-span-12 md:col-span-3 grid grid-rows-2 gap-4">
          <ClickableCard href="/review">
            <div className="flex items-center justify-between">
              <div>
                <p className="nd-label mb-1.5">{t("overview.pendingReview")}</p>
                <p className="text-[24px] font-light font-mono tracking-tight leading-none text-text-display">
                  {data.pendingReview + data.waPendingReview}
                </p>
                <p className="text-[10px] text-text-muted font-mono mt-1">
                  {data.pendingReview} {t("overview.emailDot")}{data.waPendingReview} {t("overview.wa")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted font-mono">{data.totalSent} {t("overview.sent")}</span>
                <Mail className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
              </div>
            </div>
          </ClickableCard>
          <ClickableCard href="/campaigns">
            <div className="flex items-center justify-between">
              <div>
                <p className="nd-label mb-1.5">{t("overview.activeCampaigns")}</p>
                <p className="text-[24px] font-light font-mono tracking-tight leading-none text-text-display">
                  {data.activeCampaigns}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted font-mono">{analysisPct}{t("overview.percentAnalyzed")}</span>
                <BarChart3 className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
              </div>
            </div>
          </ClickableCard>
        </div>
      </div>

      {/* ─── Bento Row 2: Tracking Funnel ─── */}
      <Card className="nd-section" texture>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <h3 className="nd-label">{t("overview.conversionFunnel")}</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-4">
          <div className="flex flex-col items-center relative">
            <MetricRing
              value={data.openRate}
              label={t("overview.openRate")}
              sub={`${data.totalOpened} ${t("common.of")} ${data.totalSent}`}
              color={data.openRate > 30 ? "success" : "accent"}
            />
            <div className="hidden md:block absolute right-0 top-1/3 w-[1px] h-8 bg-border" />
          </div>
          <div className="flex flex-col items-center relative">
            <MetricRing
              value={data.clickRate}
              label={t("overview.clicks")}
              sub={`${data.totalClicked} ${t("common.of")} ${data.totalOpened}`}
              color={data.clickRate > 5 ? "success" : "muted"}
            />
            <div className="hidden md:block absolute right-0 top-1/3 w-[1px] h-8 bg-border" />
          </div>
          <div className="flex flex-col items-center relative">
            <MetricRing
              value={data.replyRate}
              label={t("overview.replyRate")}
              sub={`${data.totalReplied} ${t("overview.replies")}`}
              color={data.replyRate > 3 ? "success" : "muted"}
            />
            <div className="hidden md:block absolute right-0 top-1/3 w-[1px] h-8 bg-border" />
          </div>
          <div className="flex flex-col items-center relative">
            <MetricRing
              value={data.waReplyRate}
              label={t("overview.waReply")}
              sub={`${data.waReplies} ${t("overview.replies")}`}
              color={data.waReplyRate > 3 ? "success" : "muted"}
            />
            <div className="hidden md:block absolute right-0 top-1/3 w-[1px] h-8 bg-border" />
          </div>
          <div className="flex flex-col items-center">
            <MetricRing
              value={data.bounceRate7d}
              label={t("overview.bounce7d")}
              sub={`${data.totalBounced} ${t("overview.total")}`}
              color={data.bounceRate7d >= 5 ? "accent" : data.bounceRate7d >= 2 ? "warning" : "success"}
            />
          </div>
        </div>
      </Card>

      {/* ─── Bento Row 3: Charts ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        {/* Email chart — wider */}
        <Card className="col-span-12 lg:col-span-7" texture>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" strokeWidth={1.5} />
              <h3 className="nd-label">{t("overview.sendsLast7d")}</h3>
            </div>
            {data.emailsByDay.length > 0 && (
              <span className="text-[20px] font-mono font-light text-text-display tabular-nums">
                {data.emailsByDay.reduce((s, d) => s + d.count, 0) + (data.waSentByDay || []).reduce((s, d) => s + d.count, 0)}
              </span>
            )}
          </div>
          {(() => {
            const chartData = (data?.emailsByDay || []).map(d => {
              const waDay = data?.waSentByDay?.find(w => w.date === d.date);
              return { ...d, waCount: waDay?.count || 0 };
            });
            // Add WA-only days not in email data
            for (const w of (data?.waSentByDay || [])) {
              if (!chartData.find(c => c.date === w.date)) {
                chartData.push({ date: w.date, count: 0, waCount: w.count });
              }
            }
            chartData.sort((a, b) => a.date.localeCompare(b.date));

            return chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8632B" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#E8632B" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="waGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#999999", fontSize: 10, fontFamily: "Space Mono" }}
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#999999", fontSize: 10, fontFamily: "Space Mono" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #E0E0E0",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "Space Mono",
                      color: "#333333",
                      padding: "8px 12px",
                      boxShadow: "none",
                    }}
                    cursor={{ stroke: "#E8632B", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#E8632B"
                    strokeWidth={2}
                    fill="url(#emailGradient)"
                    name={t("overview.chartEmails")}
                    dot={{ fill: "#E8632B", r: 3, strokeWidth: 0 }}
                    activeDot={{ fill: "#E8632B", r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="waCount"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#waGradient)"
                    name={t("overview.chartWhatsApp")}
                    dot={{ fill: "#22c55e", r: 3, strokeWidth: 0 }}
                    activeDot={{ fill: "#22c55e", r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px]">
                <span className="nd-label text-text-muted">{t("common.noData")}</span>
              </div>
            );
          })()}
        </Card>

        {/* Quality distribution — narrower bar chart */}
        <Card className="col-span-12 lg:col-span-5">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="h-4 w-4 text-accent" strokeWidth={1.5} />
            <h3 className="nd-label">{t("leads.webQuality")}</h3>
          </div>
          {data.qualityDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.qualityDist} layout="vertical" barCategoryGap="25%">
                <XAxis
                  type="number"
                  tick={{ fill: "#999999", fontSize: 10, fontFamily: "Space Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="range"
                  tick={{ fill: "#777777", fontSize: 10, fontFamily: "Space Mono" }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid #E0E0E0",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "Space Mono",
                    color: "#333333",
                    padding: "8px 12px",
                    boxShadow: "none",
                  }}
                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                />
                <Bar dataKey="count" fill="#111111" radius={[0, 3, 3, 0]} name={t("overview.chartLeads")} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px]">
              <span className="nd-label text-text-muted">{t("common.noData")}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ─── Bento Row 4: Lists with bars ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        {/* Top Cities — with inline bars */}
        <Card className="col-span-12 lg:col-span-4">
          <h3 className="nd-label mb-5">{t("overview.topCities")}</h3>
          {data.topCities.length > 0 ? (
            <div>
              {data.topCities.map((c) => (
                <div key={c.city} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push(`/leads?city=${encodeURIComponent(c.city)}`)}>
                  <ListRow
                    label={c.city}
                    value={c.count}
                    bar={c.count}
                    barMax={maxCityCount}
                    barColor="accent"
                  />
                </div>
              ))}
            </div>
          ) : (
            <span className="nd-label text-text-muted">{t("common.noData")}</span>
          )}
        </Card>

        {/* Leads por estado — with inline bars */}
        <Card className="col-span-12 lg:col-span-4">
          <h3 className="nd-label mb-5">{t("overview.leadsByStatus")}</h3>
          {data.statusCounts.length > 0 ? (
            <div>
              {data.statusCounts.map((s) => (
                <div key={s.status} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => router.push(`/leads?status=${encodeURIComponent(s.status)}`)}>
                  <ListRow
                    label={s.status.replace(/_/g, " ")}
                    value={s.count}
                    bar={s.count}
                    barMax={maxStatusCount}
                    barColor="muted"
                  />
                </div>
              ))}
            </div>
          ) : (
            <span className="nd-label text-text-muted">{t("common.noData")}</span>
          )}
        </Card>

        {/* Service Performance — with progress bars */}
        <Card className="col-span-12 lg:col-span-4">
          <h3 className="nd-label mb-5">{t("overview.performanceByService")}</h3>
          {data.serviceStats && Object.keys(data.serviceStats).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(data.serviceStats)
                .sort(([, a], [, b]) => b.recommended - a.recommended)
                .map(([service, stats]) => {
                  const contactRate = stats.recommended > 0
                    ? Math.round((stats.contacted / stats.recommended) * 100)
                    : 0;
                  return (
                    <div key={service}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-text-primary">{serviceNames[service] || service}</span>
                        <span className="text-[10px] text-text-muted font-mono">
                          {stats.contacted}/{stats.recommended}
                        </span>
                      </div>
                      <ProgressBar
                        value={contactRate}
                        color={contactRate > 50 ? "success" : contactRate > 20 ? "warning" : "muted"}
                        size="sm"
                        showValue={false}
                      />
                    </div>
                  );
                })}
            </div>
          ) : (
            <span className="nd-label text-text-muted">{t("common.noData")}</span>
          )}
        </Card>
      </div>
    </div>
  );
}
