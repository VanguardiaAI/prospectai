"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, Button, Select, Badge, StatusBadge, QualityBar, EmptyState, Spinner, Textarea, Input, Segment } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Mail, Check, X, RefreshCw, CheckCheck, Globe, MapPin, Send, FileText, Inbox, Search } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/Brands";
import { useT } from "@/i18n/LocaleProvider";

type Mode = "messages" | "replies";
type Channel = "email" | "whatsapp";
type ChannelFilter = "all" | Channel;

interface ReplyRow {
  id: number;
  leadId: number;
  channel: string;
  fromAddress: string;
  body: string | null;
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
  recipient: string;
  title: string;   // subject (email) or first line (whatsapp)
  preview: string; // body snippet for the list
  bodyHtml: string | null;
  bodyText: string;
}

const TONES = ["professional", "friendly", "direct", "consultative", "casual"];

function toItemFromEmail(r: EmailRow): InboxItem {
  return {
    key: `email:${r.email.id}`,
    channel: "email",
    id: r.email.id,
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
    recipient: r.message.toPhone,
    title: r.message.body.split("\n")[0],
    preview: r.message.body,
    bodyHtml: null,
    bodyText: r.message.body,
  };
}

function ChannelGlyph({ channel, size = 17 }: { channel: Channel; size?: number }) {
  return channel === "whatsapp" ? (
    <WhatsAppIcon size={size} />
  ) : (
    <Mail className="text-accent" style={{ width: size, height: size }} strokeWidth={1.6} />
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

  const [replyList, setReplyList] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(true);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Per-message editor state (only one message is open at a time)
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [regenTone, setRegenTone] = useState("professional");
  const [regenInstructions, setRegenInstructions] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sending, setSending] = useState(false);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkKeys, setBulkKeys] = useState<Set<string>>(new Set());

  const fetchMessages = useCallback(async () => {
    try {
      const [er, wr] = await Promise.all([
        fetch(`/api/emails?status=${status}&limit=100`).then((r) => r.json()),
        fetch(`/api/whatsapp?status=${status}&limit=100`).then((r) => r.json()),
      ]);
      setEmails(er.emails || []);
      setWaMessages(wr.messages || []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch("/api/replies");
      const data = await res.json();
      setReplyList(data.replies || []);
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  // Build the unified, sorted, filtered inbox
  const allItems = useMemo<InboxItem[]>(() => {
    const merged = [...emails.map(toItemFromEmail), ...waMessages.map(toItemFromWA)];
    merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return merged;
  }, [emails, waMessages]);

  const items = useMemo<InboxItem[]>(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((it) => {
      if (channelFilter !== "all" && it.channel !== channelFilter) return false;
      if (!q) return true;
      return (
        (it.leadName || "").toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q) ||
        it.preview.toLowerCase().includes(q) ||
        it.recipient.toLowerCase().includes(q)
      );
    });
  }, [allItems, channelFilter, search]);

  const emailCount = useMemo(() => allItems.filter((i) => i.channel === "email").length, [allItems]);
  const waCount = useMemo(() => allItems.filter((i) => i.channel === "whatsapp").length, [allItems]);

  // Derive the effective selection during render (no effect): fall back to the
  // first visible message whenever the current one is filtered out or gone.
  const effectiveKey = useMemo(() => {
    if (selectedKey && items.some((i) => i.key === selectedKey)) return selectedKey;
    return items[0]?.key ?? null;
  }, [items, selectedKey]);
  const selected = useMemo(() => items.find((i) => i.key === effectiveKey) || null, [items, effectiveKey]);

  const selectMessage = (key: string) => {
    setSelectedKey(key);
    setEditMode(false);
    setShowRegen(false);
  };

  const endpointFor = (ch: Channel) => (ch === "email" ? "/api/emails" : "/api/whatsapp");

  // ── Actions (channel-aware, operate on the open message) ──
  const setStatusFor = async (item: InboxItem, newStatus: string) => {
    setSaving(true);
    await fetch(endpointFor(item.channel), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: newStatus }),
    });
    setSaving(false);
    toast(newStatus === "approved" ? t("review.approve") : t("review.reject"), newStatus === "approved" ? "success" : "warning");
    fetchMessages();
  };

  const enterEdit = (item: InboxItem) => {
    setEditSubject(item.title);
    setEditBody(item.bodyText);
    setShowRegen(false);
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    if (selected.channel === "email") {
      await fetch("/api/emails", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          subject: editSubject,
          bodyHtml: `<p>${editBody.replace(/\n/g, "</p><p>")}</p>`,
          bodyText: editBody,
        }),
      });
    } else {
      await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, body: editBody }),
      });
    }
    setEditMode(false);
    setSaving(false);
    fetchMessages();
  };

  const regenerate = async () => {
    if (!selected) return;
    setRegenerating(true);
    const body = selected.channel === "email"
      ? { emailId: selected.id, tone: regenTone, instructions: regenInstructions }
      : { messageId: selected.id, tone: regenTone, instructions: regenInstructions };
    await fetch(endpointFor(selected.channel), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setRegenerating(false);
    setShowRegen(false);
    fetchMessages();
  };

  const sendTestEmail = async (item: InboxItem) => {
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

  const saveAsTemplate = async (item: InboxItem) => {
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

  const sendWA = async (item: InboxItem) => {
    setSending(true);
    const res = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.id, action: "send" }),
    });
    const data = await res.json();
    setSending(false);
    if (!data.success) toast(`Error: ${data.error}`, "error");
    fetchMessages();
  };

  const toggleBulk = (key: string) => {
    const next = new Set(bulkKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setBulkKeys(next);
  };

  const bulkApprove = async () => {
    if (bulkKeys.size === 0) return;
    setSaving(true);
    const emailIds: number[] = [];
    const waIds: number[] = [];
    items.forEach((it) => {
      if (!bulkKeys.has(it.key)) return;
      if (it.channel === "email") emailIds.push(it.id);
      else waIds.push(it.id);
    });
    await Promise.all([
      emailIds.length
        ? fetch("/api/emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: emailIds }) })
        : Promise.resolve(),
      waIds.length
        ? fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: waIds }) })
        : Promise.resolve(),
    ]);
    setBulkKeys(new Set());
    setBulkMode(false);
    setSaving(false);
    toast(t("review.approve"), "success");
    fetchMessages();
  };

  const subtitle = mode === "messages"
    ? `${items.length} ${t("review.messagesCount")} · ${status === "draft" ? t("review.toReview") : t(`review.${status}`)}`
    : `${replyList.length} ${t("review.repliesTab")}`;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("review.title")}</h1>
          <p className="nd-label mt-2">{subtitle}</p>
        </div>
        <Segment
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: "messages", label: <><Inbox className="h-3 w-3" strokeWidth={1.6} />{t("review.messagesTab")}</> },
            { value: "replies", label: <><Send className="h-3 w-3 rotate-180" strokeWidth={1.6} />{t("review.repliesTab")}</> },
          ]}
        />
      </div>

      {/* ════════ MESSAGES (unified inbox) ════════ */}
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
              <Button variant={bulkMode ? "secondary" : "ghost"} size="sm" onClick={() => { setBulkMode(!bulkMode); setBulkKeys(new Set()); }}>
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
                    if (bulkKeys.size === items.length) setBulkKeys(new Set());
                    else setBulkKeys(new Set(items.map((i) => i.key)));
                  }}>
                    {bulkKeys.size === items.length && items.length > 0 ? t("common.deselectAll") : t("common.selectAll")}
                  </Button>
                  <span className="nd-label text-text-muted">{bulkKeys.size} {t("common.selected")}</span>
                </div>
                <Button size="sm" variant="success" onClick={bulkApprove} disabled={bulkKeys.size === 0 || saving}>
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
              {/* ── List pane ── */}
              <Card flush className="overflow-hidden lg:sticky lg:top-4">
                <div className="lg:max-h-[calc(100vh-190px)] overflow-y-auto">
                  {items.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <p className="nd-label text-text-muted">{t("review.noMatch")}</p>
                    </div>
                  ) : (
                    items.map((it) => {
                      const active = !bulkMode && it.key === effectiveKey;
                      return (
                        <div
                          key={it.key}
                          role="button"
                          tabIndex={0}
                          data-active={active}
                          className="rv-row nd-enter-fade"
                          onClick={() => { if (bulkMode) toggleBulk(it.key); else selectMessage(it.key); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { if (bulkMode) toggleBulk(it.key); else selectMessage(it.key); } }}
                        >
                          {bulkMode ? (
                            <input
                              type="checkbox"
                              className="mt-3 flex-shrink-0"
                              checked={bulkKeys.has(it.key)}
                              onChange={() => toggleBulk(it.key)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="rv-icon" data-ch={it.channel}>
                              <ChannelGlyph channel={it.channel} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-text-display font-medium truncate">{it.leadName || t("review.unknownLead")}</span>
                              <span className="nd-chip-dot mt-0.5" style={{ background: it.status === "approved" || it.status === "sent" ? "var(--success)" : it.status === "rejected" ? "var(--accent)" : "var(--text-disabled)" }} />
                            </div>
                            <p className="text-[12.5px] text-text-secondary truncate mt-0.5">{it.title || it.preview}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="rv-chan">
                                <ChannelGlyph channel={it.channel} size={11} />
                                {it.channel === "whatsapp" ? "WhatsApp" : "Email"}
                              </span>
                              {it.leadCity && (
                                <span className="nd-label text-text-muted truncate">· {it.leadCity}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* ── Detail pane ── */}
              <div className="space-y-4">
                {!selected ? (
                  <EmptyState icon={<Mail className="h-10 w-10" strokeWidth={1.4} />} title={t("review.selectMessageTitle")} description={t("review.selectMessageDesc")} />
                ) : (
                  <>
                    {/* Message card */}
                    <Card className="nd-enter-fade" key={selected.key}>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-border">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="rv-icon" data-ch={selected.channel}>
                            <ChannelGlyph channel={selected.channel} />
                          </div>
                          <div className="min-w-0">
                            <span className="rv-chan">{selected.channel === "whatsapp" ? "WhatsApp" : "Email"}</span>
                            <div className="flex items-baseline gap-2">
                              <span className="nd-label flex-shrink-0">{t("common.to")}</span>
                              <span className="text-sm text-text-primary font-mono truncate">{selected.recipient}</span>
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={selected.status} />
                      </div>

                      {/* Body */}
                      {editMode ? (
                        <div className="space-y-4">
                          {selected.channel === "email" && (
                            <div>
                              <label className="nd-label block mb-2">{t("common.subject")}</label>
                              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                            </div>
                          )}
                          <div>
                            <label className="nd-label block mb-2">{selected.channel === "email" ? t("leads.emailBody") : t("review.message")}</label>
                            <Textarea rows={selected.channel === "email" ? 12 : 6} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                            {selected.channel === "whatsapp" && (
                              <p className="text-[10px] text-text-muted font-mono mt-1">{editBody.length}/500 {t("common.characters")}</p>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <Button size="sm" onClick={saveEdit} disabled={saving}>{t("common.save")}</Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditMode(false)}>{t("common.cancel")}</Button>
                          </div>
                        </div>
                      ) : selected.channel === "email" ? (
                        <>
                          <div className="flex items-baseline gap-3 mb-4">
                            <span className="nd-label flex-shrink-0">{t("common.subject")}</span>
                            <span className="text-[15px] text-text-display font-medium">{selected.title}</span>
                          </div>
                          <div
                            className="rv-letter px-6 py-5 text-sm text-text-primary leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: selected.bodyHtml || `<p>${selected.bodyText}</p>` }}
                          />
                        </>
                      ) : (
                        <div>
                          <div className="rv-bubble">
                            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{selected.bodyText}</p>
                          </div>
                          <p className="text-[10px] text-text-muted font-mono mt-2">{selected.bodyText.length} {t("common.characters")}</p>
                        </div>
                      )}

                      {/* Action bar */}
                      {!editMode && selected.status === "draft" && (
                        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                          <Button variant="success" size="sm" onClick={() => setStatusFor(selected, "approved")} disabled={saving}>
                            <Check className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("common.approve")}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => enterEdit(selected)}>{t("common.edit")}</Button>
                          <Button variant="secondary" size="sm" onClick={() => { setShowRegen(!showRegen); setRegenTone(selected.tone); setRegenInstructions(""); }}>
                            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.regenerate")}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setStatusFor(selected, "rejected")} disabled={saving}>
                            <X className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("common.reject")}
                          </Button>
                          {selected.channel === "email" && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => saveAsTemplate(selected)}>
                                <FileText className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.saveTemplate")}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => sendTestEmail(selected)} disabled={sendingTest}>
                                <Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {sendingTest ? t("review.sending") : t("review.sendTest")}
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {!editMode && selected.status === "approved" && selected.channel === "whatsapp" && (
                        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                          <Button variant="success" size="sm" onClick={() => sendWA(selected)} disabled={sending}>
                            {sending ? (
                              <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.6} /> {t("review.sending")}</>
                            ) : (
                              <><Send className="h-3.5 w-3.5" strokeWidth={1.6} /> {t("review.sendWa")}</>
                            )}
                          </Button>
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
                            {regenerating ? t("review.regenerating") : selected.channel === "email" ? t("review.regenerateEmail") : t("review.regenerateWa")}
                          </Button>
                        </div>
                      )}
                    </Card>

                    {/* Business info card */}
                    <Card dots title={t("review.businessInfo")} className="nd-enter-fade">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[15px] text-text-display font-medium">{selected.leadName || t("review.unknownLead")}</h4>
                          {selected.leadCategory && <p className="nd-label text-text-muted mt-1">{selected.leadCategory}</p>}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          {selected.leadCity && (
                            <div className="flex items-center gap-2 text-sm text-text-secondary">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.6} /> {selected.leadCity}
                            </div>
                          )}
                          {selected.channel === "whatsapp" && selected.leadPhone && (
                            <div className="flex items-center gap-2 text-sm text-text-secondary">
                              <WhatsAppIcon size={14} /> {selected.leadPhone}
                            </div>
                          )}
                          {selected.leadWebsite && (
                            <div className="flex items-center gap-2 text-sm min-w-0">
                              <Globe className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" strokeWidth={1.6} />
                              <a href={selected.leadWebsite.startsWith("http") ? selected.leadWebsite : `https://${selected.leadWebsite}`} target="_blank" rel="noopener noreferrer" className="nd-link truncate">{selected.leadWebsite}</a>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.quality")}</span>
                            <QualityBar score={selected.leadScore} size="sm" />
                          </div>
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.opportunity")}</span>
                            <QualityBar score={selected.leadOpportunity} size="sm" />
                          </div>
                        </div>
                        {selected.leadAnalysisSummary && (
                          <div className="border border-border rounded-lg p-3">
                            <span className="nd-label block mb-1">{t("review.analysis")}</span>
                            <p className="text-[12px] text-text-primary leading-relaxed">{selected.leadAnalysisSummary}</p>
                          </div>
                        )}
                        <div className="pt-3 border-t border-border">
                          <span className="nd-label block mb-1.5">{t("review.tone")}</span>
                          <Badge>{selected.tone.toUpperCase()}</Badge>
                        </div>
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
              return (
                <Card key={r.id} className="nd-enter-fade">
                  <div className="flex items-start gap-3">
                    <div className="rv-icon" data-ch={ch}>
                      <ChannelGlyph channel={ch} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-text-display truncate">{r.leadName || t("review.unknownLead")}</span>
                        <span className="nd-label text-text-muted flex-shrink-0">{r.receivedAt}</span>
                      </div>
                      <p className="text-[11px] text-text-muted font-mono mb-2 truncate">{r.fromAddress}</p>
                      <p className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">{r.body || ""}</p>
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
