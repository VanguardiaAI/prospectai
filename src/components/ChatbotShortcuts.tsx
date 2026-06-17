"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Lock,
  AlertTriangle,
  UserCog,
  Megaphone,
  Search,
  ClipboardCheck,
  BarChart3,
  Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import { useT } from "@/i18n/LocaleProvider";

// ─── State from /api/assistant/guidance ─────────────────────────────

interface Guidance {
  profile: { configured: boolean };
  campaigns: { count: number };
  channelsInUse: { email: boolean; whatsapp: boolean };
  leads: { count: number };
  drafts: { pending: number };
  services: {
    email: { configured: boolean; required: boolean };
    whatsapp: { configured: boolean; required: boolean };
  };
}

type ChipState = "available" | "done" | "locked";

// ─── Shortcut chip ──────────────────────────────────────────────────

function ShortcutChip({
  icon: Icon,
  label,
  state,
  onClick,
  title,
}: {
  icon: typeof Search;
  label: string;
  state: ChipState;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono",
        "transition-colors cursor-pointer border",
        state === "done" &&
          "border-success/30 bg-success-subtle text-success",
        state === "available" &&
          "border-border text-text-secondary hover:border-accent/40 hover:text-accent",
        state === "locked" &&
          "border-border/60 bg-bg-tertiary text-text-muted hover:text-text-secondary"
      )}
    >
      {state === "done" ? (
        <Check className="w-3 h-3 shrink-0" />
      ) : state === "locked" ? (
        <Lock className="w-3 h-3 shrink-0" />
      ) : (
        <Icon className="w-3 h-3 shrink-0" />
      )}
      <span>{label}</span>
    </button>
  );
}

// ─── Service warning row ────────────────────────────────────────────

function WarningRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-left",
        "border border-accent/30 bg-accent-subtle text-text-primary",
        "hover:border-accent/50 transition-colors cursor-pointer"
      )}
    >
      <AlertTriangle className="w-3.5 h-3.5 text-accent shrink-0" />
      <span>{label}</span>
    </button>
  );
}

// ─── Main ───────────────────────────────────────────────────────────

export function ChatbotShortcuts({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const { t } = useT();
  const [g, setG] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant/guidance")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setG(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      </div>
    );
  }

  // Without guidance state, fail soft: show nothing extra (input bar still works).
  if (!g) return null;

  const profileDone = g.profile.configured;
  const hasCampaigns = g.campaigns.count > 0;
  const hasDrafts = g.drafts.pending > 0;

  // A warning only fires when the service is used by a campaign AND not configured.
  const warnEmail = g.services.email.required && !g.services.email.configured;
  const warnWhatsapp =
    g.services.whatsapp.required && !g.services.whatsapp.configured;

  const p = (key: string) => t(`chatbot.shortcuts.prompts.${key}`);

  return (
    <div className="max-w-sm mx-auto text-left space-y-3">
      {/* Service warnings — channel-gated */}
      {(warnEmail || warnWhatsapp) && (
        <div className="space-y-1.5">
          {warnEmail && (
            <WarningRow
              label={t("chatbot.warnings.email")}
              onClick={() => onSelect(t("chatbot.warnings.promptEmail"))}
            />
          )}
          {warnWhatsapp && (
            <WarningRow
              label={t("chatbot.warnings.whatsapp")}
              onClick={() => onSelect(t("chatbot.warnings.promptWhatsapp"))}
            />
          )}
        </div>
      )}

      {/* Guided shortcuts */}
      <div>
        <p className="nd-label text-text-secondary mb-2">
          {t("chatbot.shortcuts.title")}
        </p>
        <div className="flex flex-wrap gap-2">
          <ShortcutChip
            icon={UserCog}
            label={profileDone ? t("chatbot.shortcuts.profileDone") : t("chatbot.shortcuts.profile")}
            state={profileDone ? "done" : "available"}
            onClick={() => onSelect(p("profile"))}
          />
          <ShortcutChip
            icon={Megaphone}
            label={t("chatbot.shortcuts.createCampaign")}
            state={profileDone ? "available" : "locked"}
            title={profileDone ? undefined : t("chatbot.shortcuts.lockedProfile")}
            onClick={() =>
              onSelect(profileDone ? p("createCampaign") : p("createCampaignLocked"))
            }
          />
          <ShortcutChip
            icon={Search}
            label={t("chatbot.shortcuts.searchLeads")}
            state={hasCampaigns ? "available" : "locked"}
            title={hasCampaigns ? undefined : t("chatbot.shortcuts.lockedCampaign")}
            onClick={() =>
              onSelect(hasCampaigns ? p("searchLeads") : p("searchLeadsLocked"))
            }
          />
          <ShortcutChip
            icon={ClipboardCheck}
            label={
              hasDrafts
                ? `${t("chatbot.shortcuts.reviewMessages")} (${g.drafts.pending})`
                : t("chatbot.shortcuts.reviewMessages")
            }
            state={hasDrafts ? "available" : "locked"}
            title={hasDrafts ? undefined : t("chatbot.shortcuts.lockedDrafts")}
            onClick={() => onSelect(p("reviewMessages"))}
          />
          <ShortcutChip
            icon={BarChart3}
            label={t("chatbot.shortcuts.metrics")}
            state="available"
            onClick={() => onSelect(p("metrics"))}
          />
        </div>
      </div>
    </div>
  );
}
