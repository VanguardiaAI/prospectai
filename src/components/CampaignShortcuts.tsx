"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Spinner } from "@/components/ui";
import {
  Search,
  ScanSearch,
  PenLine,
  ClipboardCheck,
  Send,
  Reply,
  Check,
  Lock,
  ChevronDown,
  ChevronUp,
  Zap,
  Users,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";
import { useChatbot } from "./ChatbotProvider";

// ─── Types ──────────────────────────────────────────────────────────

type CampaignPhase = "search" | "analysis" | "generation" | "review" | "sending" | "engagement";

interface PhaseData {
  done: boolean;
  count?: number;
  pending?: number;
  analyzed?: number;
  emailDrafts?: number;
  waDrafts?: number;
  pendingEmail?: number;
  pendingWa?: number;
  approved?: number;
  sent?: number;
  replied?: number;
}

interface CampaignWithPhases {
  id: number;
  name: string;
  status: string;
  leadCount: number;
  currentPhase: CampaignPhase;
  currentPhaseIndex: number;
  phases: Record<CampaignPhase, PhaseData>;
  metrics: { sent: number; opened: number; openRate: number; replies: number };
}

// ─── Phase Config ───────────────────────────────────────────────────

const PHASES: {
  key: CampaignPhase;
  icon: typeof Search;
  labelKey: string;
  chatCommand: (id: number, name: string) => string | null;
  navigateTo?: (id: number) => string;
}[] = [
  {
    key: "search",
    icon: Search,
    labelKey: "shortcuts.search",
    chatCommand: (id, name) =>
      `Search for leads on Google Maps for campaign "${name}" (ID: ${id})`,
  },
  {
    key: "analysis",
    icon: ScanSearch,
    labelKey: "shortcuts.analyze",
    chatCommand: () => `Process scraping and analysis jobs`,
  },
  {
    key: "generation",
    icon: PenLine,
    labelKey: "shortcuts.generate",
    chatCommand: () => `Process email and WhatsApp generation jobs`,
  },
  {
    key: "review",
    icon: ClipboardCheck,
    labelKey: "shortcuts.review",
    chatCommand: () => null,
    navigateTo: (id) => `/review?campaignId=${id}`,
  },
  {
    key: "sending",
    icon: Send,
    labelKey: "shortcuts.send",
    chatCommand: (id) =>
      `Approve and send all pending draft messages for campaign ID ${id}`,
  },
  {
    key: "engagement",
    icon: Reply,
    labelKey: "shortcuts.engagement",
    chatCommand: () => `Process follow-up sequences`,
  },
];

// ─── Phase Button ───────────────────────────────────────────────────

function PhaseButton({
  phase,
  phaseData,
  isCurrentPhase,
  isPast,
  campaignId,
  campaignName,
  t,
}: {
  phase: (typeof PHASES)[number];
  phaseData: PhaseData;
  isCurrentPhase: boolean;
  isPast: boolean;
  campaignId: number;
  campaignName: string;
  t: (key: string) => string;
}) {
  const { sendMessage } = useChatbot();
  const router = useRouter();
  const Icon = phase.icon;

  const isLocked = !isPast && !isCurrentPhase;
  const isDone = isPast || phaseData.done;

  const handleClick = () => {
    if (isLocked) return;

    if (phase.navigateTo) {
      router.push(phase.navigateTo(campaignId));
      return;
    }

    const command = phase.chatCommand(campaignId, campaignName);
    if (command) {
      sendMessage(command);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLocked}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wide",
        "transition-all duration-200 cursor-pointer",
        "disabled:cursor-not-allowed",
        isLocked && "bg-muted/5 text-muted/30 border border-muted/10",
        isCurrentPhase &&
          "bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15 shadow-sm shadow-accent/10",
        isDone &&
          !isCurrentPhase &&
          "bg-success/8 text-success/70 border border-success/20 hover:bg-success/12"
      )}
    >
      {isDone && !isCurrentPhase ? (
        <Check className="w-3 h-3" />
      ) : isLocked ? (
        <Lock className="w-3 h-3" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      <span>{t(phase.labelKey) || phase.key}</span>
    </button>
  );
}

// ─── Campaign Row ───────────────────────────────────────────────────

function CampaignRow({ campaign, t }: { campaign: CampaignWithPhases; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(true);
  const totalPhases = PHASES.length;
  const completedPhases = campaign.currentPhaseIndex;
  const progressPct = Math.round((completedPhases / totalPhases) * 100);

  return (
    <div className="border border-muted/10 rounded-xl overflow-hidden">
      {/* Campaign header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/3 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Badge color={campaign.status === "active" ? "success" : "warning"}>
            {campaign.status === "active" ? "ACTIVE" : "PAUSED"}
          </Badge>
          <span className="text-sm font-medium text-fg truncate">
            {campaign.name}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted">
            <Users className="w-3 h-3" />
            <span>{campaign.leadCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted">
            <span>{progressPct}%</span>
          </div>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="w-full h-1 bg-muted/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.max(progressPct, 5)}%` }}
              />
            </div>
          </div>

          {/* Phase buttons */}
          <div className="flex flex-wrap gap-2">
            {PHASES.map((phase, idx) => (
              <PhaseButton
                key={phase.key}
                phase={phase}
                phaseData={campaign.phases[phase.key]}
                isCurrentPhase={idx === campaign.currentPhaseIndex}
                isPast={idx < campaign.currentPhaseIndex}
                campaignId={campaign.id}
                campaignName={campaign.name}
                t={t}
              />
            ))}
          </div>

          {/* Quick stats */}
          {campaign.metrics.sent > 0 && (
            <div className="flex gap-4 mt-3 text-[10px] font-mono text-muted">
              <span>
                {t("shortcuts.sent") || "Sent"}: {campaign.metrics.sent}
              </span>
              <span>
                {t("shortcuts.openRate") || "Open"}: {campaign.metrics.openRate}%
              </span>
              <span>
                {t("shortcuts.replies") || "Replies"}: {campaign.metrics.replies}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Widget ────────────────────────────────────────────────────

export function CampaignShortcuts() {
  const { t } = useT();
  const [campaigns, setCampaigns] = useState<CampaignWithPhases[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/phases");
      if (res.ok) {
        setCampaigns(await res.json());
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
      <Card className="nd-section">
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      </Card>
    );
  }

  if (campaigns.length === 0) return null;

  return (
    <Card className="nd-section" texture>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-accent" strokeWidth={1.5} />
        <h3 className="nd-label">
          {t("shortcuts.title") || "Campaign Actions"}
        </h3>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <CampaignRow key={campaign.id} campaign={campaign} t={t} />
        ))}
      </div>
    </Card>
  );
}
