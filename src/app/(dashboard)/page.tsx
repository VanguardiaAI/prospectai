"use client";

import { useEffect, useState, useCallback } from "react";
import { StatCard, Card, Badge, Spinner } from "@/components/ui";
import { Users, BarChart3, Mail, Send, Clock, Eye, MousePointerClick, MessageCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

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
  // Tracking
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  // Bounces
  totalBounced: number;
  bouncedToday: number;
  bounceRate7d: number;
  // Services
  serviceStats: Record<string, { recommended: number; contacted: number }>;
}

// Nothing Design: monochrome with opacity, not hue variety
const PIE_COLORS = ["#FFFFFF", "#999999", "#666666", "#444444", "#333333", "#222222"];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      {/* Page Header */}
      <div className="nd-page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="nd-label mt-2">Resumen general de tu prospeccion</p>
        </div>
        <div className="flex items-center gap-3">
          {data.autopilotGlobal && (
            <Badge color="success">AUTOPILOT ON</Badge>
          )}
          {data.pendingJobs > 0 && (
            <Badge>
              <Clock className="h-3 w-3 mr-1" strokeWidth={1.5} /> {data.pendingJobs} JOBS
            </Badge>
          )}
        </div>
      </div>

      {/* Bounce rate alerts */}
      {data.bounceRate7d >= 5 && (
        <div className="mb-4 px-4 py-3 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-mono">
          ENVIOS PAUSADOS — Bounce rate 7d: {data.bounceRate7d}% (umbral: 5%). Limpia la lista antes de reanudar.
        </div>
      )}
      {data.bounceRate7d >= 2 && data.bounceRate7d < 5 && (
        <div className="mb-4 px-4 py-3 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 text-sm font-mono">
          AVISO — Bounce rate 7d: {data.bounceRate7d}% (umbral critico: 5%). Considera verificar emails antes de enviar.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 nd-section">
        <StatCard
          label="Total Leads"
          value={data.totalLeads}
          icon={<Users className="h-5 w-5" strokeWidth={1.5} />}
        />
        <StatCard
          label="Analizados"
          value={data.analyzed}
          sub={`de ${data.totalLeads}`}
          icon={<BarChart3 className="h-5 w-5" strokeWidth={1.5} />}
        />
        <StatCard
          label="Emails Hoy"
          value={`${data.sentToday} / ${data.globalDailyLimit}`}
          sub={data.sentToday >= data.globalDailyLimit ? "Limite alcanzado" : `${data.globalDailyLimit - data.sentToday} restantes`}
          icon={<Send className="h-5 w-5" strokeWidth={1.5} />}
          color={data.sentToday >= data.globalDailyLimit ? "warning" : "default"}
        />
        <StatCard
          label="Por Revisar"
          value={data.pendingReview}
          sub={`${data.totalSent} enviados total`}
          icon={<Mail className="h-5 w-5" strokeWidth={1.5} />}
          color={data.pendingReview > 0 ? "warning" : "default"}
        />
      </div>

      {/* Tracking Funnel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 nd-section">
        <StatCard
          label="Tasa Apertura"
          value={`${data.openRate}%`}
          sub={`${data.totalOpened} de ${data.totalSent} enviados`}
          icon={<Eye className="h-5 w-5" strokeWidth={1.5} />}
          color={data.openRate > 30 ? "success" : "default"}
        />
        <StatCard
          label="Tasa Clicks"
          value={`${data.clickRate}%`}
          sub={`${data.totalClicked} de ${data.totalOpened} abiertos`}
          icon={<MousePointerClick className="h-5 w-5" strokeWidth={1.5} />}
          color={data.clickRate > 5 ? "success" : "default"}
        />
        <StatCard
          label="Tasa Respuesta"
          value={`${data.replyRate}%`}
          sub={`${data.totalReplied} respuestas totales`}
          icon={<MessageCircle className="h-5 w-5" strokeWidth={1.5} />}
          color={data.replyRate > 3 ? "success" : "default"}
        />
        <StatCard
          label="Bounce Rate 7d"
          value={`${data.bounceRate7d}%`}
          sub={`${data.totalBounced} bounces total`}
          icon={<Mail className="h-5 w-5" strokeWidth={1.5} />}
          color={data.bounceRate7d >= 5 ? "danger" : data.bounceRate7d >= 2 ? "warning" : "default"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 nd-section">
        <Card texture>
          <h3 className="nd-label mb-6">Emails enviados · ultimos 7 dias</h3>
          {data.emailsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.emailsByDay} barCategoryGap="20%">
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#666666", fontSize: 10, fontFamily: "Space Mono" }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={{ stroke: "#222222" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#666666", fontSize: 10, fontFamily: "Space Mono" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111111",
                    border: "1px solid #333333",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "Space Mono",
                    color: "#E8E8E8",
                    padding: "8px 12px",
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="count" fill="#E8E8E8" radius={0} name="Enviados" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px]">
              <span className="nd-label text-text-muted">[SIN DATOS]</span>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="nd-label mb-6">Distribucion de calidad web</h3>
          {data.qualityDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.qualityDist}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={30}
                  dataKey="count"
                  nameKey="range"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(props: any) => `${props.range}`}
                  labelLine={{ stroke: "#444444", strokeWidth: 1 }}
                  stroke="#000000"
                  strokeWidth={2}
                >
                  {data.qualityDist.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#111111",
                    border: "1px solid #333333",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "Space Mono",
                    color: "#E8E8E8",
                    padding: "8px 12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px]">
              <span className="nd-label text-text-muted">[SIN DATOS]</span>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row — Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="nd-label mb-5">Top ciudades</h3>
          {data.topCities.length > 0 ? (
            <div>
              {data.topCities.map((c, i) => (
                <div
                  key={c.city}
                  className={`nd-list-item ${i > 0 ? "" : "pt-0"}`}
                >
                  <span className="text-sm text-text-primary">{c.city}</span>
                  <span className="text-[12px] text-text-display font-mono tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="nd-label text-text-muted">[SIN DATOS]</span>
          )}
        </Card>

        <Card>
          <h3 className="nd-label mb-5">Leads por estado</h3>
          {data.statusCounts.length > 0 ? (
            <div>
              {data.statusCounts.map((s, i) => (
                <div
                  key={s.status}
                  className={`nd-list-item ${i > 0 ? "" : "pt-0"}`}
                >
                  <span className="nd-list-label">{s.status.replace(/_/g, " ")}</span>
                  <span className="text-[12px] text-text-display font-mono tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="nd-label text-text-muted">[SIN DATOS]</span>
          )}
        </Card>
      </div>

      {/* Service Performance */}
      {data.serviceStats && Object.keys(data.serviceStats).length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          <Card>
            <h3 className="nd-label mb-5">Rendimiento por servicio</h3>
            <div>
              {Object.entries(data.serviceStats)
                .sort(([, a], [, b]) => b.recommended - a.recommended)
                .map(([service, stats], i) => {
                  const serviceNames: Record<string, string> = {
                    web_development: "Desarrollo Web",
                    seo: "SEO",
                    ai_agents: "AI / Chatbots",
                    google_business: "Google Business",
                    social_media: "Social Media",
                  };
                  const contactRate = stats.recommended > 0
                    ? Math.round((stats.contacted / stats.recommended) * 100)
                    : 0;

                  return (
                    <div
                      key={service}
                      className={`nd-list-item ${i > 0 ? "" : "pt-0"}`}
                    >
                      <span className="text-sm text-text-primary">{serviceNames[service] || service}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-text-muted font-mono">{stats.recommended} RECOMENDADOS</span>
                        <span className="text-[10px] text-text-muted font-mono">{stats.contacted} CONTACTADOS</span>
                        <span className="text-[12px] text-text-display font-mono tabular-nums">{contactRate}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
