"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Button, Select, StatusBadge, QualityBar, EmptyState, Spinner, Textarea, Input, Segment } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Mail, Check, X, RefreshCw, CheckCheck, Globe, MapPin, Send, FileText, Inbox, Search, Clock, AlertTriangle } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/Brands";
import { useT } from "@/i18n/LocaleProvider";
import { clsx } from "clsx";
import { INTENT_TONE, isReplyIntent } from "@/lib/reply-intent";
import { CampaignSelector } from "@/components/CampaignSelector";
import { useCampaign } from "@/components/CampaignProvider";

const INTENT_BADGE_CLASS: Record<"good" | "warn" | "muted", string> = {
  good: "border-success/40 text-success bg-success-subtle",
  warn: "border-accent/40 text-accent bg-accent-subtle",
  muted: "border-border-visible text-text-secondary bg-surface-raised",
};

type Mode = "messages" | "replies";
type Channel = "email" | "whatsapp";
type ChannelFilter = "all" | Channel;

interface ReplyRow {
  id: number;
  leadId: number;
  channel: string;
  fromAddress: string;
  body: string | null;
  status: string;
  intent: string | null;
  handledAt: string | null;
  receivedAt: string;
  leadName: string | null;
  leadCity: string | null;
}

interface EmailRow {
  email: {
    id: number;
    leadId: number;
    campaignId: number | null;
    toEmail: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    tone: string;
    status: string;
    createdAt: string;
    scheduledFor: string | null;
  };
  leadName: string | null;
  leadCategory: string | null;
  leadCity: string | null;
  leadWebsite: string | null;
  leadScore: number | null;
  leadOpportunity: number | null;
  leadAnalysisSummary: string | null;
}

interface WARow {
  message: {
    id: number;
    leadId: number;
    campaignId: number | null;
    toPhone: string;
    body: string;
    tone: string;
    status: string;
    createdAt: string;
    scheduledFor: string | null;
    waMessageId: string | null;
  };
  leadName: string | null;
  leadCategory: string | null;
  leadCity: string | null;
  leadWebsite: string | null;
  leadPhone: string | null;
  leadScore: number | null;
  leadOpportunity: number | null;
  leadAnalysisSummary: string | null;
}

/** Normalized inbox entry — a single message regardless of channel. */
interface InboxItem {
  key: string;
  channel: Channel;
  id: number;
  campaignId: number | null;
  leadId: number;
  leadName: string | null;
  leadCategory: string | null;
  leadCity: string | null;
  leadWebsite: string | null;
  leadPhone: string | null;
  leadScore: number | null;
  leadOpportunity: number | null;
  leadAnalysisSummary: string | null;
  status: string;
  tone: string;
  createdAt: string;
  scheduledFor: string | null; // when an approved message is queued to send
  recipient: string;
  title: string;   // subject (email) or first line (whatsapp)
  preview: string; // body snippet for the list
  bodyHtml: string | null;
  bodyText: string;
}

/** All messages for one company (lead), grouped so the two channels are linked. */
interface CompanyGroup {
  leadId: number;
  leadName: string | null;
  leadCategory: string | null;
  leadCity: string | null;
  leadWebsite: string | null;
  leadPhone: string | null;
  leadScore: number | null;
  leadOpportunity: number | null;
  leadAnalysisSummary: string | null;
  messages: InboxItem[]; // email (primary) first, then WhatsApp (fallback)
}

/** A prior message to the same company (different lead/campaign). */
interface PriorContact {
  channel: Channel;
  campaignName: string | null;
  strategy: string | null;
  status: string;
  sentAt: string | null;
  matchedOn: "email" | "phone" | "domain";
}

const TONES = ["professional", "friendly", "direct", "consultative", "casual"];

function toItemFromEmail(r: EmailRow): InboxItem {
  return {
    key: `email:${r.email.id}`,
    channel: "email",
    id: r.email.id,
    campaignId: r.email.campaignId,
    leadId: r.email.leadId,
    leadName: r.leadName,
    leadCategory: r.leadCategory,
    leadCity: r.leadCity,
    leadWebsite: r.leadWebsite,
    leadPhone: null,
    leadScore: r.leadScore,
    leadOpportunity: r.leadOpportunity,
    leadAnalysisSummary: r.leadAnalysisSummary,
    status: r.email.status,
    tone: r.email.tone,
    createdAt: r.email.createdAt,
    scheduledFor: r.email.scheduledFor,
    recipient: r.email.toEmail,
    title: r.email.subject,
    preview: r.email.bodyText,
    bodyHtml: r.email.bodyHtml,
    bodyText: r.email.bodyText,
  };
}

function toItemFromWA(r: WARow): InboxItem {
  return {
    key: `whatsapp:${r.message.id}`,
    channel: "whatsapp",
    id: r.message.id,
    campaignId: r.message.campaignId,
    leadId: r.message.leadId,
    leadName: r.leadName,
    leadCategory: r.leadCategory,
    leadCity: r.leadCity,
    leadWebsite: r.leadWebsite,
    leadPhone: r.leadPhone,
    leadScore: r.leadScore,
    leadOpportunity: r.leadOpportunity,
    leadAnalysisSummary: r.leadAnalysisSummary,
    status: r.message.status,
    tone: r.message.tone,
    createdAt: r.message.createdAt,
    scheduledFor: r.message.scheduledFor,
    recipient: r.message.toPhone,
    title: r.message.body.split("\n")[0],
    preview: r.message.body,
    bodyHtml: null,
    bodyText: r.message.body,
  };
}

/** Human label for an approved message's scheduled slot, e.g. "se enviará mañana ~10:42". */
function formatScheduledFor(
  iso: string | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const when =
    dayDiff <= 0 ? t("review.today")
    : dayDiff === 1 ? t("review.tomorrow")
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return t("review.willSendAt", { when, time });
}

function ChannelGlyph({ channel, size = 17 }: { channel: Channel; size?: number }) {
  return channel === "whatsapp" ? (
    <WhatsAppIcon size={size} />
  ) : (
    <Mail className="text-accent" style={{ width: size, height: size }} strokeWidth={1.6} />
  );
}

function statusDotColor(status: string): string {
  if (status === "approved" || status === "sent") return "var(--success)";
  if (status === "rejected" || status === "failed") return "var(--accent)";
  if (status === "held") return "var(--text-secondary)";
  return "var(--text-disabled)";
}

const endpointFor = (ch: Channel) => (ch === "email" ? "/api/emails" : "/api/whatsapp");

/**
 * One message (email or WhatsApp) inside a company group, with its own
 * edit/regenerate/action state. The held WhatsApp fallback gets a distinct
 * treatment: a "send now" manual release plus a discard, instead of approve.
 */
function MessageCard({ item, fallbackDays, onChanged, onSendNow }: { item: InboxItem; fallbackDays: number; onChanged: () => void; onSendNow: (item: InboxItem) => Promise<void> }) {
  const { toast } = useToast();
  const { t } = useT();

  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [regenTone, setRegenTone] = useState(item.tone);
  const [regenInstructions, setRegenInstructions] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const isFallback = item.channel === "whatsapp" && item.status === "held";
  const endpoint = endpointFor(item.channel);

  const setStatus = async (newStatus: string) => {
    setBusy(true);
    await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: newStatus }),
    });
    setBusy(false);
    if (newStatus === "approved") toast(t("review.approve"), "success");
    else if (newStatus === "rejected") toast(t("review.reject"), "warning");
    onChanged();
  };

  const enterEdit = () => {
    setEditSubject(item.title);
    setEditBody(item.bodyText);
    setShowRegen(false);
    setEditMode(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    if (item.channel === "email") {
      await fetch("/api/emails", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          subject: editSubject,
          bodyHtml: `<p>${editBody.replace(/\n/g, "</p><p>")}</p>`,
          bodyText: editBody,
        }),
      });
    } else {
      await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, body: editBody }),
      });
    }
    setEditMode(false);
    setBusy(false);
    onChanged();
  };

  const regenerate = async () => {
    setRegenerating(true);
    const body = item.channel === "email"
      ? { emailId: item.id, tone: regenTone, instructions: regenInstructions }
      : { messageId: item.id, tone: regenTone, instructions: regenInstructions };
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setRegenerating(false);
    setShowRegen(false);
    onChanged();
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: item.id }),
      });
      const data = await res.json();
      if (data.success) toast(t("review.testEmailSent", { email: data.sentTo }), "success");
      else toast(`Error: ${data.error}`, "error");
    } catch {
      toast(t("common.error"), "error");
    }
    setSendingTest(false);
  };

  const saveAsTemplate = async () => {
    const name = prompt(t("templates.namePlaceholder"));
    if (!name) return;
    const category = prompt(t("templates.categoryOptional"));
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmailId: item.id, name, category: category || null }),
    });
    toast(t("templates.templateSaved"), "success");
  };

  const sendWA = async () => {
    setBusy(true);
    const res = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.id, action: "send" }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.success) toast(`Error: ${data.error}`, "error");
    onChanged();
  };

  return (
    <Card className="nd-enter-fade">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rv-icon" data-ch={item.channel}>
            <ChannelGlyph channel={item.channel} />
          </div>
          <div className="min-w-0">
            <span className="rv-chan">
              {item.channel === "whatsapp" ? "WhatsApp" : "Email"}
              <span className={clsx(
                "ml-1.5 rounded-full border px-1.5 py-0.5 text-[8.5px] font-mono uppercase tracking-[0.08em]",
                isFallback ? "border-border-visible text-text-secondary bg-surface-raised" : "border-accent/40 text-accent bg-accent-subtle"
              )}>
                {isFallback ? t("review.fallbackBadge") : t("review.primaryBadge")}
              </span>
            </span>
            <div className="flex items-baseline gap-2">
              <span className="nd-label flex-shrink-0">{t("common.to")}</span>
              <span className="text-sm text-text-primary font-mono truncate">{item.recipient}</span>
            </div>
          </div>
        </div>
        {isFallback ? (
          <span className="flex items-center gap-1.5 rounded-full border border-border-visible bg-surface-raised px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.06em] text-text-secondary">
            <Clock className="h-3 w-3" strokeWidth={1.6} /> {t("review.heldStatus")}
          </span>
        ) : (
          <StatusBadge status={item.status} />
        )}
      </div>

      {/* Held fallback note */}
      {isFallback && !editMode && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5">
          <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-text-secondary" strokeWidth={1.6} />
          <p className="text-[12px] text-text-secondary leading-relaxed">{t("review.heldNote", { days: fallbackDays })}</p>
        </div>
      )}

      {/* Body */}
      {editMode ? (
        <div className="space-y-4">
          {item.channel === "email" && (
            <div>
              <label className="nd-label block mb-2">{t("common.subject")}</label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
            </div>
          )}
          <div>
            <label className="nd-label block mb-2">{item.channel === "email" ? t("leads.emailBody") : t("review.message")}</label>
            <Textarea rows={item.channel === "email" ? 12 : 6} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            {item.channel === "whatsapp" && (
              <p className="text-[10px] text-text-muted font-mono mt-1">{editBody.length}/500 {t("common.characters")}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button size="sm" onClick={saveEdit} disabled={busy}>{t("common.save")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditMode(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : item.channel === "email" ? (
        <>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="nd-label flex-shrink-0">{t("common.subject")}</span>
            <span className="text-[15px] text-text-display font-medium">{item.title}</span>
          </div>
          <div
            className="rv-letter px-6 py-5 text-sm text-text-primary leading-relaxed"
            dangerouslySetInnerHTML={{ __html: item.bodyHtml || `<p>${item.bodyText}</p>` }}
          />
        </>
      ) : (
        <div>
          <div className="rv-bubble">
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{item.bodyText}</p>
          </div>
          <p className="text-[10px] text-text-muted font-mono mt-2">{item.bodyText.length} {t("common.characters")}</p>
        </div>
      )}

      {/* Action bar — held fallback */}
      {!editMode && isFallback && (
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
          <Button variant="success" size="sm" onClick={async () => { setBusy(true); await onSendNow(item); setBusy(false); }} disabled={busy}>
            <Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.sendNow")}
          </Button>
          <Button variant="secondary" size="sm" onClick={enterEdit}>{t("common.edit")}</Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowRegen(!showRegen); setRegenTone(item.tone); setRegenInstructions(""); }}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.regenerate")}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setStatus("rejected")} disabled={busy}>
            <X className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.discardFallback")}
          </Button>
        </div>
      )}

      {/* Action bar — draft */}
      {!editMode && item.status === "draft" && (
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
          <Button variant="success" size="sm" onClick={() => setStatus("approved")} disabled={busy}>
            <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("common.approve")}
          </Button>
          <Button variant="secondary" size="sm" onClick={enterEdit}>{t("common.edit")}</Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowRegen(!showRegen); setRegenTone(item.tone); setRegenInstructions(""); }}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.regenerate")}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setStatus("rejected")} disabled={busy}>
            <X className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("common.reject")}
          </Button>
          {item.channel === "email" && (
            <>
              <Button variant="ghost" size="sm" onClick={saveAsTemplate}>
                <FileText className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.saveTemplate")}
              </Button>
              <Button variant="ghost" size="sm" onClick={sendTestEmail} disabled={sendingTest}>
                <Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {sendingTest ? t("review.sending") : t("review.sendTest")}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Action bar — approved WhatsApp (auto-sent at the scheduled slot; manual override available) */}
      {!editMode && item.status === "approved" && item.channel === "whatsapp" && (
        <div className="mt-5 pt-4 border-t border-border space-y-3">
          <p className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.6} /> {formatScheduledFor(item.scheduledFor, t) ?? t("review.waitingAuto")}
          </p>
          <Button variant="success" size="sm" onClick={sendWA} disabled={busy}>
            {busy ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.6} /> {t("review.sending")}</>
            ) : (
              <><Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.sendWaNow")}</>
            )}
          </Button>
        </div>
      )}

      {/* Action bar — approved email (auto-sent by cron at the scheduled slot) */}
      {!editMode && item.status === "approved" && item.channel === "email" && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.6} /> {formatScheduledFor(item.scheduledFor, t) ?? t("review.waitingAuto")}
          </p>
        </div>
      )}

      {/* Regenerate panel */}
      {showRegen && !editMode && (
        <div className="mt-4 p-4 border border-border rounded-lg space-y-4">
          <div>
            <label className="nd-label block mb-2">{t("review.newTone")}</label>
            <Select value={regenTone} onChange={(e) => setRegenTone(e.target.value)}>
              {TONES.map((tone) => <option key={tone} value={tone}>{t(`tones.${tone}`)}</option>)}
            </Select>
          </div>
          <div>
            <label className="nd-label block mb-2">{t("review.instructionsOptional")}</label>
            <Input value={regenInstructions} onChange={(e) => setRegenInstructions(e.target.value)} placeholder={t("review.instructionsPlaceholder")} />
          </div>
          <Button size="sm" onClick={regenerate} disabled={regenerating}>
            {regenerating ? t("review.regenerating") : item.channel === "email" ? t("review.regenerateEmail") : t("review.regenerateWa")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Warns that this company was already contacted (or is queued) elsewhere. */
function DupBanner({ items, onAck, busy }: { items: PriorContact[]; onAck: () => void; busy: boolean }) {
  const { t } = useT();
  const sent = items.filter((i) => i.status === "sent");
  const pending = items.filter((i) => i.status !== "sent");
  const isSent = sent.length > 0;
  const show = (isSent ? sent : pending).slice(0, 4);

  const serviceLabel = (s: string | null) =>
    s === "seo_visibility" ? t("review.serviceSeo") : s === "web_design" ? t("review.serviceWeb") : null;
  const matchLabel = (m: string) =>
    m === "phone" ? t("review.dupMatchPhone") : m === "domain" ? t("review.dupMatchDomain") : t("review.dupMatchEmail");

  return (
    <Card className={clsx("nd-enter-fade", isSent ? "border-accent/50" : "border-border-visible")}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={clsx("h-5 w-5 flex-shrink-0 mt-0.5", isSent ? "text-accent" : "text-text-secondary")} strokeWidth={1.7} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-text-display">{isSent ? t("review.dupTitle") : t("review.dupPendingTitle")}</h4>
          {isSent && <p className="text-[12px] text-text-secondary mt-0.5">{t("review.dupRetained")}</p>}
          <ul className="mt-2 space-y-1">
            {show.map((c, i) => {
              const svc = serviceLabel(c.strategy);
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-text-primary">
                  <ChannelGlyph channel={c.channel} size={12} />
                  <span className="font-medium">{c.channel === "whatsapp" ? "WhatsApp" : "Email"}</span>
                  <span className="text-text-muted">{t("review.dupVia")}</span>
                  <span>«{c.campaignName || "—"}»</span>
                  {svc && <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">{svc}</span>}
                  {c.sentAt && <span className="text-text-muted font-mono">· {c.sentAt.slice(0, 10)}</span>}
                  <span className="text-text-muted">· {matchLabel(c.matchedOn)}</span>
                </li>
              );
            })}
          </ul>
          {isSent && (
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={onAck} disabled={busy}>
                <Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.dupSendAnyway")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ReviewPage() {
  const { toast } = useToast();
  const { t } = useT();

  const [mode, setMode] = useState<Mode>("messages");
  const [status, setStatus] = useState("draft");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");

  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [waMessages, setWaMessages] = useState<WARow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallbackDays, setFallbackDays] = useState(3);
  const [history, setHistory] = useState<Record<number, PriorContact[]>>({});
  const [ackBusy, setAckBusy] = useState(false);

  const [replyList, setReplyList] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(true);

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  // Bulk selection (by company)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkLeadIds, setBulkLeadIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const { selectedId } = useCampaign();

  const fetchMessages = useCallback(async () => {
    try {
      // In the drafts view, also pull the parked "held" WhatsApp fallbacks so a
      // company shows both its primary email and its waiting fallback together.
      const waStatuses = status === "draft" ? ["draft", "held"] : [status];
      const [er, ...wrs] = await Promise.all([
        fetch(`/api/emails?status=${status}&limit=100`).then((r) => r.json()),
        ...waStatuses.map((s) => fetch(`/api/whatsapp?status=${s}&limit=100`).then((r) => r.json())),
      ]);
      setEmails(er.emails || []);
      setWaMessages(wrs.flatMap((w) => w.messages || []));
    } finally {
      setLoading(false);
    }
  }, [status]);

  const fetchReplies = useCallback(async () => {
    try {
      const qs = selectedId != null ? `?campaignId=${selectedId}` : "";
      const res = await fetch(`/api/replies${qs}`);
      const data = await res.json();
      setReplyList(data.replies || []);
    } finally {
      setRepliesLoading(false);
    }
  }, [selectedId]);

  const toggleReplyHandled = useCallback(async (id: number, handled: boolean) => {
    const action = handled ? "handle" : "unhandle";
    setReplyList((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: handled ? "handled" : "unread" } : r))
    );
    try {
      await fetch("/api/replies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
    } catch {
      fetchReplies();
    }
  }, [fetchReplies]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  // Fallback delay (days) — for the held-fallback note. Defaults to 3.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        const n = parseInt(s?.fallback_delay_days ?? "", 10);
        if (Number.isFinite(n) && n >= 0) setFallbackDays(n);
      })
      .catch(() => { /* keep default */ });
  }, []);

  // Merge → scope to campaign → filter (channel + search)
  const allItems = useMemo<InboxItem[]>(() => {
    const merged = [...emails.map(toItemFromEmail), ...waMessages.map(toItemFromWA)];
    merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return merged;
  }, [emails, waMessages]);

  const campaignItems = useMemo<InboxItem[]>(
    () => (selectedId == null ? allItems : allItems.filter((it) => it.campaignId === selectedId)),
    [allItems, selectedId]
  );

  const items = useMemo<InboxItem[]>(() => {
    const q = search.trim().toLowerCase();
    return campaignItems.filter((it) => {
      if (channelFilter !== "all" && it.channel !== channelFilter) return false;
      if (!q) return true;
      return (
        (it.leadName || "").toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q) ||
        it.preview.toLowerCase().includes(q) ||
        it.recipient.toLowerCase().includes(q)
      );
    });
  }, [campaignItems, channelFilter, search]);

  // Group by company (lead): email (primary) first, then WhatsApp (fallback).
  const groups = useMemo<CompanyGroup[]>(() => {
    const map = new Map<number, CompanyGroup>();
    for (const it of items) {
      let g = map.get(it.leadId);
      if (!g) {
        g = {
          leadId: it.leadId,
          leadName: it.leadName,
          leadCategory: it.leadCategory,
          leadCity: it.leadCity,
          leadWebsite: it.leadWebsite,
          leadPhone: it.leadPhone,
          leadScore: it.leadScore,
          leadOpportunity: it.leadOpportunity,
          leadAnalysisSummary: it.leadAnalysisSummary,
          messages: [],
        };
        map.set(it.leadId, g);
      } else if (g.leadPhone == null && it.leadPhone != null) {
        g.leadPhone = it.leadPhone;
      }
      g.messages.push(it);
    }
    const list = Array.from(map.values());
    for (const g of list) {
      g.messages.sort((a, b) => {
        if (a.channel !== b.channel) return a.channel === "email" ? -1 : 1;
        return a.createdAt < b.createdAt ? 1 : -1;
      });
    }
    const latest = (g: CompanyGroup) => g.messages.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), "");
    list.sort((a, b) => (latest(a) < latest(b) ? 1 : latest(a) > latest(b) ? -1 : 0));
    return list;
  }, [items]);

  // Cross-campaign contact history for the companies on screen (already-contacted warning).
  const leadIdsKey = useMemo(() => groups.map((g) => g.leadId).sort((a, b) => a - b).join(","), [groups]);
  useEffect(() => {
    if (!leadIdsKey) { setHistory({}); return; }
    fetch(`/api/contact-history?leadIds=${leadIdsKey}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history || {}))
      .catch(() => { /* keep prior */ });
  }, [leadIdsKey]);

  const ackDuplicate = useCallback(async (leadId: number) => {
    setAckBusy(true);
    try {
      await fetch("/api/contact-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action: "ack" }),
      });
      toast(t("review.dupAckToast"), "success");
    } finally {
      setAckBusy(false);
      fetchMessages();
      fetch(`/api/contact-history?leadIds=${leadIdsKey}`).then((r) => r.json()).then((d) => setHistory(d.history || {})).catch(() => {});
    }
  }, [toast, t, fetchMessages, leadIdsKey]);

  const emailCount = useMemo(() => campaignItems.filter((i) => i.channel === "email").length, [campaignItems]);
  const waCount = useMemo(() => campaignItems.filter((i) => i.channel === "whatsapp").length, [campaignItems]);

  const effectiveLeadId = useMemo(() => {
    if (selectedLeadId != null && groups.some((g) => g.leadId === selectedLeadId)) return selectedLeadId;
    return groups[0]?.leadId ?? null;
  }, [groups, selectedLeadId]);
  const selectedGroup = useMemo(() => groups.find((g) => g.leadId === effectiveLeadId) || null, [groups, effectiveLeadId]);

  const toggleBulk = (leadId: number) => {
    const next = new Set(bulkLeadIds);
    if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
    setBulkLeadIds(next);
  };

  // Bulk approve only approves draft messages (held fallbacks are never bulk-released).
  const bulkApprove = async () => {
    if (bulkLeadIds.size === 0) return;
    setSaving(true);
    const emailIds: number[] = [];
    const waIds: number[] = [];
    groups.forEach((g) => {
      if (!bulkLeadIds.has(g.leadId)) return;
      g.messages.forEach((m) => {
        if (m.status !== "draft") return;
        if (m.channel === "email") emailIds.push(m.id); else waIds.push(m.id);
      });
    });
    await Promise.all([
      emailIds.length
        ? fetch("/api/emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: emailIds }) })
        : Promise.resolve(),
      waIds.length
        ? fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: waIds }) })
        : Promise.resolve(),
    ]);
    setBulkLeadIds(new Set());
    setBulkMode(false);
    setSaving(false);
    toast(t("review.approve"), "success");
    fetchMessages();
  };

  // Manual fallback override: send the WhatsApp now. To honor "never both at
  // once", first cancel the company's still-unsent email, then release and send
  // the WhatsApp. If WhatsApp isn't connected it stays approved and the cron /
  // Send button delivers it later.
  const sendFallbackNow = useCallback(async (waItem: InboxItem) => {
    const group = groups.find((g) => g.leadId === waItem.leadId);
    const email = group?.messages.find((m) => m.channel === "email");
    if (email && (email.status === "draft" || email.status === "approved")) {
      await fetch("/api/emails", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email.id, status: "rejected" }),
      });
    }
    await fetch("/api/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: waItem.id, status: "approved" }),
    });
    let sentNow = false;
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: waItem.id, action: "send" }),
      });
      const data = await res.json();
      sentNow = !!data.success;
      if (!sentNow && data.error) toast(`Error: ${data.error}`, "error");
    } catch { /* leave approved; cron will send */ }
    toast(sentNow ? t("review.fallbackSent") : t("review.fallbackReleased"), "success");
    fetchMessages();
  }, [groups, toast, t, fetchMessages]);

  const subtitle = mode === "messages"
    ? `${groups.length} ${t("review.companiesCount")} · ${items.length} ${t("review.messagesCount")}`
    : `${replyList.length} ${t("review.repliesTab")}`;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("review.title")}</h1>
          <p className="nd-label mt-2">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <CampaignSelector />
          <Segment
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { value: "messages", label: <><Inbox className="h-3 w-3" strokeWidth={1.6} />{t("review.messagesTab")}</> },
              { value: "replies", label: <><Send className="h-3 w-3 rotate-180" strokeWidth={1.6} />{t("review.repliesTab")}</> },
            ]}
          />
        </div>
      </div>

      {/* ════════ MESSAGES (grouped by company) ════════ */}
      {mode === "messages" && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Segment
              value={channelFilter}
              onChange={(v) => setChannelFilter(v)}
              options={[
                { value: "all", label: <>{t("review.allChannels")} <span className="font-mono text-text-muted">{allItems.length}</span></> },
                { value: "email", label: <><Mail className="h-3 w-3 text-accent" strokeWidth={1.6} />{emailCount}</> },
                { value: "whatsapp", label: <><WhatsAppIcon size={12} />{waCount}</> },
              ]}
            />
            <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">{t("review.drafts")}</option>
              <option value="approved">{t("review.approved")}</option>
              <option value="sent">{t("review.sent")}</option>
              <option value="rejected">{t("review.rejected")}</option>
            </Select>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" strokeWidth={1.6} />
              <Input className="!pl-9" placeholder={t("review.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {status === "draft" && allItems.length > 0 && (
              <Button variant={bulkMode ? "secondary" : "ghost"} size="sm" onClick={() => { setBulkMode(!bulkMode); setBulkLeadIds(new Set()); }}>
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.6} /> {bulkMode ? t("common.cancel") : t("common.bulk")}
              </Button>
            )}
          </div>

          {/* Bulk action bar */}
          {bulkMode && (
            <Card flush className="mb-4 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (bulkLeadIds.size === groups.length) setBulkLeadIds(new Set());
                    else setBulkLeadIds(new Set(groups.map((g) => g.leadId)));
                  }}>
                    {bulkLeadIds.size === groups.length && groups.length > 0 ? t("common.deselectAll") : t("common.selectAll")}
                  </Button>
                  <span className="nd-label text-text-muted">{bulkLeadIds.size} {t("common.selected")}</span>
                </div>
                <Button size="sm" variant="success" onClick={bulkApprove} disabled={bulkLeadIds.size === 0 || saving}>
                  <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("common.approve")}
                </Button>
              </div>
            </Card>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : allItems.length === 0 ? (
            <EmptyState icon={<Inbox className="h-10 w-10" strokeWidth={1.4} />} title={t("review.noMessagesTitle")} description={t("review.noMessagesDesc")} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr] gap-4 items-start">
              {/* ── Company list pane ── */}
              <Card flush className="overflow-hidden lg:sticky lg:top-4">
                <div className="lg:max-h-[calc(100vh-190px)] overflow-y-auto">
                  {groups.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <p className="nd-label text-text-muted">{t("review.noMatch")}</p>
                    </div>
                  ) : (
                    groups.map((g) => {
                      const active = !bulkMode && g.leadId === effectiveLeadId;
                      const primary = g.messages[0];
                      const hasHeld = g.messages.some((m) => m.status === "held");
                      const dupContacted = (history[g.leadId] || []).some((c) => c.status === "sent");
                      return (
                        <div
                          key={g.leadId}
                          role="button"
                          tabIndex={0}
                          data-active={active}
                          className="rv-row nd-enter-fade"
                          onClick={() => { if (bulkMode) toggleBulk(g.leadId); else setSelectedLeadId(g.leadId); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { if (bulkMode) toggleBulk(g.leadId); else setSelectedLeadId(g.leadId); } }}
                        >
                          {bulkMode ? (
                            <input
                              type="checkbox"
                              className="mt-3 flex-shrink-0"
                              checked={bulkLeadIds.has(g.leadId)}
                              onChange={() => toggleBulk(g.leadId)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="rv-icon" data-ch={primary.channel}>
                              <ChannelGlyph channel={primary.channel} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-text-display font-medium truncate">{g.leadName || t("review.unknownLead")}</span>
                              <span className="flex items-center gap-1 flex-shrink-0">
                                {dupContacted && <AlertTriangle className="h-3 w-3 text-accent" strokeWidth={1.8} />}
                                {hasHeld && <Clock className="h-3 w-3 text-text-secondary" strokeWidth={1.7} />}
                              </span>
                            </div>
                            <p className="text-[12.5px] text-text-secondary truncate mt-0.5">{primary.title || primary.preview}</p>
                            {/* Per-channel status chips — both channels shown linked */}
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5">
                              {g.messages.map((m) => (
                                <span key={m.key} className="rv-chan">
                                  <span className="nd-chip-dot" style={{ background: statusDotColor(m.status) }} />
                                  <ChannelGlyph channel={m.channel} size={11} />
                                  {m.channel === "whatsapp" ? "WhatsApp" : "Email"}
                                  {m.status === "held" && <span className="text-text-muted"> · {t("review.heldStatus")}</span>}
                                </span>
                              ))}
                              {g.leadCity && <span className="nd-label text-text-muted truncate">· {g.leadCity}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* ── Detail pane (company) ── */}
              <div className="space-y-4">
                {!selectedGroup ? (
                  <EmptyState icon={<Mail className="h-10 w-10" strokeWidth={1.4} />} title={t("review.selectMessageTitle")} description={t("review.selectMessageDesc")} />
                ) : (
                  <>
                    {/* Already-contacted-elsewhere warning (cross-campaign dedup) */}
                    {history[selectedGroup.leadId]?.length ? (
                      <DupBanner items={history[selectedGroup.leadId]} onAck={() => ackDuplicate(selectedGroup.leadId)} busy={ackBusy} />
                    ) : null}

                    {/* One card per message — primary email then held WhatsApp fallback */}
                    {selectedGroup.messages.map((m) => (
                      <MessageCard key={`${m.key}:${m.status}`} item={m} fallbackDays={fallbackDays} onChanged={fetchMessages} onSendNow={sendFallbackNow} />
                    ))}

                    {/* Business info card (shared by the company) */}
                    <Card dots title={t("review.businessInfo")} className="nd-enter-fade">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[15px] text-text-display font-medium">{selectedGroup.leadName || t("review.unknownLead")}</h4>
                          {selectedGroup.leadCategory && <p className="nd-label text-text-muted mt-1">{selectedGroup.leadCategory}</p>}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          {selectedGroup.leadCity && (
                            <div className="flex items-center gap-2 text-sm text-text-secondary">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.6} /> {selectedGroup.leadCity}
                            </div>
                          )}
                          {selectedGroup.leadPhone && (
                            <div className="flex items-center gap-2 text-sm text-text-secondary">
                              <WhatsAppIcon size={14} /> {selectedGroup.leadPhone}
                            </div>
                          )}
                          {selectedGroup.leadWebsite && (
                            <div className="flex items-center gap-2 text-sm min-w-0">
                              <Globe className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
                              <a href={selectedGroup.leadWebsite.startsWith("http") ? selectedGroup.leadWebsite : `https://${selectedGroup.leadWebsite}`} target="_blank" rel="noopener noreferrer" className="nd-link truncate">{selectedGroup.leadWebsite}</a>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.quality")}</span>
                            <QualityBar score={selectedGroup.leadScore} size="sm" />
                          </div>
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.opportunity")}</span>
                            <QualityBar score={selectedGroup.leadOpportunity} size="sm" />
                          </div>
                        </div>
                        {selectedGroup.leadAnalysisSummary && (
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.analysis")}</span>
                            <p className="text-[12px] text-text-primary leading-relaxed">{selectedGroup.leadAnalysisSummary}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════ REPLIES (inbound) ════════ */}
      {mode === "replies" && (
        repliesLoading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : replyList.length === 0 ? (
          <EmptyState icon={<Inbox className="h-10 w-10" strokeWidth={1.4} />} title={t("review.repliesTab")} description={t("review.noReplies")} />
        ) : (
          <div className="space-y-3">
            {replyList.map((r) => {
              const ch: Channel = r.channel === "whatsapp" ? "whatsapp" : "email";
              const handled = r.status === "handled";
              return (
                <Card key={r.id} className={clsx("nd-enter-fade", handled && "opacity-60")}>
                  <div className="flex items-start gap-3">
                    <div className="rv-icon" data-ch={ch}>
                      <ChannelGlyph channel={ch} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!handled && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" aria-label={t("review.unread")} />}
                        <span className="text-sm font-medium text-text-display truncate">{r.leadName || t("review.unknownLead")}</span>
                        {isReplyIntent(r.intent) && (
                          <span className={clsx("flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.06em]", INTENT_BADGE_CLASS[INTENT_TONE[r.intent]])}>
                            {t(`intent.${r.intent}`)}
                          </span>
                        )}
                        <span className="nd-label text-text-muted flex-shrink-0 ml-auto">{r.receivedAt}</span>
                      </div>
                      <p className="text-[11px] text-text-muted font-mono mb-2 truncate">{r.fromAddress}</p>
                      <p className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">{r.body || ""}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button size="sm" variant={handled ? "ghost" : "secondary"} onClick={() => toggleReplyHandled(r.id, !handled)}>
                          <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
                          {handled ? t("review.markUnread") : t("review.markHandled")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
