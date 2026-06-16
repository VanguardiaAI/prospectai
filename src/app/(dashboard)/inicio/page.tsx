"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, Spinner } from "@/components/ui";
import { Inbox, MessageSquare, Send, Clock, Settings, Sparkles } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

interface DashboardData {
  sentToday: number;
  pendingReview: number;
  pendingJobs: number;
  totalReplied: number;
  waReplies: number;
  waPendingReview: number;
  waSentToday: number;
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

  const metrics = [
    { key: "pendingReview", label: t("home.pendingReview"), value: pendingReview, icon: Inbox },
    { key: "replies", label: t("home.replies"), value: replies, icon: MessageSquare },
    { key: "sentToday", label: t("home.sentToday"), value: sentToday, icon: Send },
    { key: "inQueue", label: t("home.inQueue"), value: inQueue, icon: Clock },
  ];

  return (
    <div>
      <div className="nd-page-header">
        <div>
          <h1>{t("home.title")}</h1>
          <p className="nd-label mt-2">{t("home.subtitle")}</p>
        </div>
      </div>

      {/* Métricas de atención */}
      <div className="nd-section grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Link key={m.key} href="/review">
            <Card className="cursor-pointer transition-all duration-200 hover:border-accent/40">
              <m.icon className="h-4 w-4 text-text-muted mb-3" strokeWidth={1.5} />
              <div className="text-3xl font-medium text-text-display">{m.value}</div>
              <div className="nd-label mt-1">{m.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Accesos directos */}
      <div className="nd-section grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/review">
          <Card className="cursor-pointer transition-all duration-200 hover:border-accent/40 h-full">
            <div className="flex items-start gap-3">
              <Inbox className="h-5 w-5 text-accent mt-0.5" strokeWidth={1.5} />
              <div>
                <h3 className="text-sm font-medium mb-1">{t("home.reviewTitle")}</h3>
                <p className="text-[11px] text-text-muted leading-relaxed">{t("home.reviewDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/settings">
          <Card className="cursor-pointer transition-all duration-200 hover:border-accent/40 h-full">
            <div className="flex items-start gap-3">
              <Settings className="h-5 w-5 text-text-muted mt-0.5" strokeWidth={1.5} />
              <div>
                <h3 className="text-sm font-medium mb-1">{t("home.settingsTitle")}</h3>
                <p className="text-[11px] text-text-muted leading-relaxed">{t("home.settingsDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Pista: todo lo demás por prompt */}
      <div className="nd-section">
        <Card className="border-accent/40">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-accent mt-0.5" strokeWidth={1.5} />
            <div>
              <h3 className="text-sm font-medium mb-1">{t("home.assistTitle")}</h3>
              <p className="text-[11px] text-text-muted leading-relaxed">{t("home.assistDesc")}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
