"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Kanban, RefreshCw, Mail, MessageCircle } from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

interface Lead {
  id: number;
  name: string;
  category: string | null;
  city: string | null;
  opportunityScore: number | null;
  status: string;
}

const PIPELINE_STATUSES = [
  { key: "imported", labelKey: "pipeline.imported", track: "common" },
  { key: "scraped", labelKey: "pipeline.scraped", track: "common" },
  { key: "analyzed", labelKey: "pipeline.analyzed", track: "common" },
  { key: "email_generated", labelKey: "pipeline.emailGenerated", track: "email" },
  { key: "email_approved", labelKey: "pipeline.emailApproved", track: "email" },
  { key: "email_sent", labelKey: "pipeline.emailSent", track: "email" },
  { key: "wa_generated", labelKey: "pipeline.waGenerated", track: "whatsapp" },
  { key: "wa_approved", labelKey: "pipeline.waApproved", track: "whatsapp" },
  { key: "wa_sent", labelKey: "pipeline.waSent", track: "whatsapp" },
  { key: "contacted", labelKey: "pipeline.contacted", track: "common" },
  { key: "replied", labelKey: "pipeline.replied", track: "common" },
] as const;

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (score >= 40) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

export default function PipelinePage() {
  const { t } = useT();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads?limit=500");
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const grouped: Record<string, Lead[]> = {};
  for (const s of PIPELINE_STATUSES) {
    grouped[s.key] = [];
  }
  for (const lead of leads) {
    if (grouped[lead.status]) {
      grouped[lead.status].push(lead);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Kanban className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <div>
            <h1 className="text-lg font-medium text-text-display font-mono tracking-tight uppercase">
              {t("pipeline.title")}
            </h1>
            <p className="text-[11px] text-text-muted font-mono mt-0.5">
              {leads.length} {t("pipeline.leadsInPipeline")}
            </p>
          </div>
        </div>
        <button
          onClick={fetchLeads}
          disabled={loading}
          className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border",
            "text-[11px] font-mono uppercase tracking-wide text-text-muted",
            "hover:bg-bg-tertiary hover:text-text-secondary transition-colors",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw
            className={clsx("h-3.5 w-3.5", loading && "animate-spin")}
            strokeWidth={1.5}
          />
          {t("pipeline.refresh")}
        </button>
      </div>

      {/* Board */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-3 min-w-max">
          {PIPELINE_STATUSES.map(({ key, labelKey, track }) => {
            const items = grouped[key];
            return (
              <div
                key={key}
                className={clsx(
                  "min-w-[220px] w-[220px] flex flex-col bg-bg-secondary border rounded-[12px] overflow-hidden",
                  track === "whatsapp" ? "border-green-500/20" : "border-border"
                )}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {track === "email" && <Mail className="h-3 w-3 text-accent/60" strokeWidth={1.5} />}
                    {track === "whatsapp" && <MessageCircle className="h-3 w-3 text-green-500/60" strokeWidth={1.5} />}
                    <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted">
                      {t(labelKey)}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded-md min-w-[20px] text-center">
                    {items.length}
                  </span>
                </div>

                {/* Scrollable card list */}
                <div className="flex-1 overflow-y-auto max-h-[calc(100vh-220px)] p-2 space-y-1.5">
                  {items.length === 0 && (
                    <p className="text-[10px] text-text-muted font-mono text-center py-6 opacity-40">
                      {t("pipeline.noLeads")}
                    </p>
                  )}
                  {items.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() =>
                        router.push(
                          `/leads?search=${encodeURIComponent(lead.name)}`
                        )
                      }
                      className={clsx(
                        "w-full text-left px-2.5 py-2 rounded-lg border border-border",
                        "bg-bg-primary hover:bg-bg-tertiary transition-colors cursor-pointer",
                        "group"
                      )}
                    >
                      <p className="text-[11px] font-medium text-text-primary font-mono leading-snug truncate group-hover:text-text-display transition-colors">
                        {lead.name}
                      </p>
                      <p className="text-[9px] text-text-muted font-mono mt-0.5 truncate">
                        {[lead.city, lead.category].filter(Boolean).join(" / ") ||
                          "---"}
                      </p>
                      {lead.opportunityScore != null && (
                        <span
                          className={clsx(
                            "inline-block mt-1 text-[9px] font-mono px-1.5 py-0.5 rounded border",
                            scoreColor(lead.opportunityScore)
                          )}
                        >
                          {lead.opportunityScore}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
