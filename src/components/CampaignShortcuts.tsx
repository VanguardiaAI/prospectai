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
import { useToast } from "@/components/Toast";
import { PhaseLoader } from "./PhaseLoader";
import { MissingConfigModal } from "./MissingConfigModal";
import { SearchInputModal } from "./SearchInputModal";

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

interface ConfigItem {
  key: string;
  type: "env" | "setting";
  settingsSection?: string;
}

// ─── Phase Config ───────────────────────────────────────────────────

const PHASES: {
  key: CampaignPhase;
  icon: typeof Search;
  labelKey: string;
  navigateTo?: (id: number) => string;
}[] = [
  { key: "search", icon: Search, labelKey: "shortcuts.search" },
  { key: "analysis", icon: ScanSearch, labelKey: "shortcuts.analyze" },
  { key: "generation", icon: PenLine, labelKey: "shortcuts.generate" },
  {
    key: "review",
    icon: ClipboardCheck,
    labelKey: "shortcuts.review",
    navigateTo: (id) => `/review?campaignId=${id}`,
  },
  { key: "sending", icon: Send, labelKey: "shortcuts.send" },
  { key: "engagement", icon: Reply, labelKey: "shortcuts.engagement" },
];

// ─── Phase Button ───────────────────────────────────────────────────

function PhaseButton({
  phase,
  phaseData,
  isCurrentPhase,
  isPast,
  isExecuting,
  disabled,
  onExecute,
  t,
}: {
  phase: (typeof PHASES)[number];
  phaseData: PhaseData;
  isCurrentPhase: boolean;
  isPast: boolean;
  isExecuting: boolean;
  disabled: boolean;
  onExecute: () => void;
  t: (key: string) => string;
}) {
  const Icon = phase.icon;
  const isLocked = !isPast && !isCurrentPhase;
  const isDone = isPast || phaseData.done;

  return (
    <button
      onClick={onExecute}
      disabled={isLocked || disabled}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wide",
        "transition-all duration-200 cursor-pointer",
        "disabled:cursor-not-allowed",
        isExecuting && "ring-1 ring-accent/50 animate-pulse",
        isLocked && "bg-muted/5 text-muted/30 border border-muted/10",
        isCurrentPhase &&
          !isExecuting &&
          "bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15 shadow-sm shadow-accent/10",
        isDone &&
          !isCurrentPhase &&
          !isExecuting &&
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

function CampaignRow({
  campaign,
  t,
  onRefresh,
}: {
  campaign: CampaignWithPhases;
  t: (key: string) => string;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [executingPhase, setExecutingPhase] = useState<CampaignPhase | null>(null);
  const [executeTotal, setExecuteTotal] = useState(0);
  const [missingConfig, setMissingConfig] = useState<{
    items: ConfigItem[];
    warnings: string[];
  } | null>(null);
  const [showSearchInput, setShowSearchInput] = useState(false);

  const totalPhases = PHASES.length;
  const completedPhases = campaign.currentPhaseIndex;
  const progressPct = Math.round((completedPhases / totalPhases) * 100);

  const handlePhaseComplete = useCallback(() => {
    const phase = executingPhase;
    setExecutingPhase(null);
    setExecuteTotal(0);
    if (phase) {
      toast(t(`shortcuts.phaseComplete.${phase}`) || "Done", "success");
    }
    onRefresh();
  }, [executingPhase, t, toast, onRefresh]);

  const executePhase = useCallback(
    async (phase: CampaignPhase, keyword?: string) => {
      setExecutingPhase(phase);
      setExecuteTotal(0);
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase, keyword }),
        });
        const data = await res.json();

        if (data.success && data.started) {
          // Fire-and-forget: API returned immediately, PhaseLoader will track progress
          setExecuteTotal(data.total ?? 0);
          // For search with total=0, auto-complete after a short delay
          if (phase === "search") {
            setTimeout(handlePhaseComplete, 3000);
          }
        } else if (data.error === "missing_config") {
          setExecutingPhase(null);
          setMissingConfig({ items: data.missing, warnings: data.warnings || [] });
        } else if (data.error === "no_drafts") {
          setExecutingPhase(null);
          toast(t("shortcuts.noDrafts") || data.message, "warning");
        } else {
          setExecutingPhase(null);
          toast(data.message || data.error || t("shortcuts.phaseError"), "error");
        }
      } catch {
        setExecutingPhase(null);
        toast(t("shortcuts.phaseError"), "error");
      }
    },
    [campaign.id, t, toast, handlePhaseComplete]
  );

  const handlePhaseClick = useCallback(
    (phase: (typeof PHASES)[number]) => {
      if (executingPhase) return;

      // Review → navigate directly
      if (phase.navigateTo) {
        router.push(phase.navigateTo(campaign.id));
        return;
      }

      // Search → show keyword input modal
      if (phase.key === "search") {
        setShowSearchInput(true);
        return;
      }

      // All other phases → execute directly
      executePhase(phase.key);
    },
    [executingPhase, router, campaign.id, executePhase]
  );

  const handleSearchSubmit = useCallback(
    (keyword: string) => {
      setShowSearchInput(false);
      executePhase("search", keyword);
    },
    [executePhase]
  );

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
        <div className="px-4 pb-4 relative">
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
                isExecuting={executingPhase === phase.key}
                disabled={!!executingPhase}
                onExecute={() => handlePhaseClick(phase)}
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

          {/* Phase loader overlay */}
          {executingPhase && executingPhase !== "review" && (
            <PhaseLoader
              phase={executingPhase}
              campaignId={campaign.id}
              total={executeTotal}
              visible
              onComplete={handlePhaseComplete}
            />
          )}
        </div>
      )}

      {/* Missing config modal */}
      <MissingConfigModal
        open={!!missingConfig}
        onClose={() => setMissingConfig(null)}
        items={missingConfig?.items || []}
        warnings={missingConfig?.warnings || []}
      />

      {/* Search keyword modal */}
      <SearchInputModal
        open={showSearchInput}
        onClose={() => setShowSearchInput(false)}
        onSubmit={handleSearchSubmit}
        campaignName={campaign.name}
        loading={executingPhase === "search"}
      />
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
          <CampaignRow
            key={campaign.id}
            campaign={campaign}
            t={t}
            onRefresh={fetchData}
          />
        ))}
      </div>
    </Card>
  );
}
