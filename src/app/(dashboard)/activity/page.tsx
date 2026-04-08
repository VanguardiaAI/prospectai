"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Select, EmptyState, Spinner, Badge, Button } from "@/components/ui";
import { useT } from "@/i18n/LocaleProvider";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";

interface ActivityEntry {
  id: number;
  type: string;
  message: string;
  leadId: number | null;
  campaignId: number | null;
  metadata: string | null;
  createdAt: string;
}

const typeColors: Record<string, "default" | "accent" | "success" | "warning" | "danger" | "info"> = {
  import: "info",
  scrape: "default",
  analyze: "default",
  email_generated: "warning",
  email_approved: "success",
  email_rejected: "danger",
  email_sent: "success",
  email_failed: "danger",
  blacklist: "danger",
  setting_change: "info",
  campaign_change: "info",
  error: "danger",
};

export default function ActivityPage() {
  const { t } = useT();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (typeFilter) params.set("type", typeFilter);
    const res = await fetch(`/api/activity?${params}`);
    const data = await res.json();
    setActivity(data.activity);
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("activity.title")}</h1>
          <p className="nd-label mt-2">{t("activity.subtitle")}</p>
        </div>
        <Select className="w-44" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">{t("activity.allTypes")}</option>
          <option value="import">{t("activity.imports")}</option>
          <option value="scrape">{t("activity.scraping")}</option>
          <option value="email_generated">{t("activity.emailsGenerated")}</option>
          <option value="email_sent">{t("activity.emailsSent")}</option>
          <option value="email_failed">{t("activity.emailsFailed")}</option>
          <option value="error">{t("activity.errors")}</option>
          <option value="setting_change">{t("activity.config")}</option>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : activity.length === 0 ? (
        <EmptyState icon={<Activity className="h-10 w-10" strokeWidth={1.5} />} title={t("activity.noActivity")} description={t("activity.noActivityDesc")} />
      ) : (
        <>
          <Card>
            <div>
              {activity.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <Badge color={typeColors[entry.type] || "default"}>
                    {entry.type.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{(() => {
                      if (!entry.metadata) return entry.message;
                      try {
                        const meta = JSON.parse(entry.metadata);
                        if (meta._i18nKey) return t(meta._i18nKey, meta._i18nVars);
                      } catch {}
                      return entry.message;
                    })()}</p>
                    <p className="nd-label text-text-muted mt-1">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.leadId && ` · Lead #${entry.leadId}`}
                      {entry.campaignId && ` · ${t("common.campaign")} #${entry.campaignId}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <span className="nd-label text-text-muted">{t("common.page")} {page}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button size="sm" variant="ghost" disabled={activity.length < 50} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
