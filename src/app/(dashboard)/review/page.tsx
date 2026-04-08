"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Select, Badge, StatusBadge, QualityBar, EmptyState, Spinner, Textarea, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Mail, Check, X, RefreshCw, ChevronLeft, ChevronRight, CheckCheck, Globe, MapPin, MessageCircle, Send, FileText } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

type ReviewTab = "emails" | "whatsapp";

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

export default function ReviewPage() {
  const { toast } = useToast();
  const { t } = useT();
  const [tab, setTab] = useState<ReviewTab>("emails");
  // Email state
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailIndex, setEmailIndex] = useState(0);
  const [emailStatus, setEmailStatus] = useState("draft");
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenTone, setRegenTone] = useState("professional");
  const [regenInstructions, setRegenInstructions] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  // WhatsApp state
  const [waMessages, setWaMessages] = useState<WARow[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [waIndex, setWaIndex] = useState(0);
  const [waStatus, setWaStatus] = useState("draft");
  const [waEditMode, setWaEditMode] = useState(false);
  const [waEditBody, setWaEditBody] = useState("");
  const [waRegenerating, setWaRegenerating] = useState(false);
  const [waRegenTone, setWaRegenTone] = useState("professional");
  const [waRegenInstructions, setWaRegenInstructions] = useState("");
  const [waShowRegen, setWaShowRegen] = useState(false);
  const [waBulkMode, setWaBulkMode] = useState(false);
  const [waSelectedIds, setWaSelectedIds] = useState<Set<number>>(new Set());
  const [waSaving, setWaSaving] = useState(false);
  const [waSending, setWaSending] = useState(false);

  const fetchEmails = useCallback(async () => {
    setEmailLoading(true);
    const res = await fetch(`/api/emails?status=${emailStatus}&limit=100`);
    const data = await res.json();
    setEmails(data.emails);
    setEmailIndex(0);
    setEmailLoading(false);
  }, [emailStatus]);

  const fetchWA = useCallback(async () => {
    setWaLoading(true);
    const res = await fetch(`/api/whatsapp?status=${waStatus}&limit=100`);
    const data = await res.json();
    setWaMessages(data.messages);
    setWaIndex(0);
    setWaLoading(false);
  }, [waStatus]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);
  useEffect(() => { fetchWA(); }, [fetchWA]);

  const current = emails[emailIndex];
  const currentWA = waMessages[waIndex];

  // Email actions
  const approveEmail = async (id: number) => {
    setSaving(true);
    await fetch("/api/emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "approved" }) });
    setSaving(false);
    toast(t("review.approve"), "success");
    fetchEmails();
  };

  const rejectEmail = async (id: number) => {
    setSaving(true);
    await fetch("/api/emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "rejected" }) });
    setSaving(false);
    toast(t("review.reject"), "warning");
    fetchEmails();
  };

  const sendTestEmail = async (emailId: number) => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`Email de prueba enviado a ${data.sentTo}`, "success");
      } else {
        toast(`Error: ${data.error}`, "error");
      }
    } catch {
      toast(t("common.error"), "error");
    }
    setSendingTest(false);
  };

  const saveEmailEdit = async () => {
    if (!current) return;
    setSaving(true);
    await fetch("/api/emails", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.email.id, subject: editSubject, bodyHtml: `<p>${editBody.replace(/\n/g, "</p><p>")}</p>`, bodyText: editBody }),
    });
    setEditMode(false);
    setSaving(false);
    fetchEmails();
  };

  const regenerateEmail = async () => {
    if (!current) return;
    setRegenerating(true);
    await fetch("/api/emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId: current.email.id, tone: regenTone, instructions: regenInstructions }),
    });
    setRegenerating(false);
    setShowRegen(false);
    fetchEmails();
  };

  const bulkApproveEmails = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    await fetch("/api/emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: [...selectedIds] }) });
    setSelectedIds(new Set());
    setBulkMode(false);
    setSaving(false);
    fetchEmails();
  };

  const enterEmailEdit = () => {
    if (!current) return;
    setEditSubject(current.email.subject);
    setEditBody(current.email.bodyText);
    setEditMode(true);
  };

  const saveAsTemplate = async () => {
    if (!current) return;
    const name = prompt(t("templates.namePlaceholder"));
    if (!name) return;
    const category = prompt(t("templates.categoryOptional"));
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmailId: current.email.id, name, category: category || null }),
    });
    toast(t("templates.templateSaved"), "success");
  };

  // WhatsApp actions
  const approveWA = async (id: number) => {
    setWaSaving(true);
    await fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "approved" }) });
    setWaSaving(false);
    toast(t("review.approve"), "success");
    fetchWA();
  };

  const rejectWA = async (id: number) => {
    setWaSaving(true);
    await fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "rejected" }) });
    setWaSaving(false);
    toast(t("review.reject"), "warning");
    fetchWA();
  };

  const saveWAEdit = async () => {
    if (!currentWA) return;
    setWaSaving(true);
    await fetch("/api/whatsapp", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentWA.message.id, body: waEditBody }),
    });
    setWaEditMode(false);
    setWaSaving(false);
    fetchWA();
  };

  const regenerateWA = async () => {
    if (!currentWA) return;
    setWaRegenerating(true);
    await fetch("/api/whatsapp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: currentWA.message.id, tone: waRegenTone, instructions: waRegenInstructions }),
    });
    setWaRegenerating(false);
    setWaShowRegen(false);
    fetchWA();
  };

  const bulkApproveWA = async () => {
    if (waSelectedIds.size === 0) return;
    setWaSaving(true);
    await fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulkApprove: true, ids: [...waSelectedIds] }) });
    setWaSelectedIds(new Set());
    setWaBulkMode(false);
    setWaSaving(false);
    fetchWA();
  };

  const sendWA = async (id: number) => {
    setWaSending(true);
    const res = await fetch("/api/whatsapp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id, action: "send" }),
    });
    const data = await res.json();
    setWaSending(false);
    if (!data.success) {
      alert(`Error: ${data.error}`);
    }
    fetchWA();
  };

  if (tab === "emails" && emailLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (tab === "whatsapp" && waLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("review.title")}</h1>
          <p className="nd-label mt-2">
            {tab === "emails"
              ? `${emails.length} emails ${emailStatus === "draft" ? t("review.toReview") : emailStatus}`
              : `${waMessages.length} WhatsApps ${waStatus === "draft" ? t("review.toReview") : waStatus}`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex border border-border rounded-full overflow-hidden">
            <button
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.06em] transition-colors cursor-pointer ${tab === "emails" ? "bg-text-display text-bg-primary" : "text-text-muted hover:text-text-secondary"}`}
              onClick={() => { setTab("emails"); setBulkMode(false); setWaBulkMode(false); }}
            >
              <Mail className="h-3 w-3 inline mr-1.5" strokeWidth={1.5} />Emails
            </button>
            <button
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.06em] transition-colors cursor-pointer ${tab === "whatsapp" ? "bg-text-display text-bg-primary" : "text-text-muted hover:text-text-secondary"}`}
              onClick={() => { setTab("whatsapp"); setBulkMode(false); setWaBulkMode(false); }}
            >
              <MessageCircle className="h-3 w-3 inline mr-1.5" strokeWidth={1.5} />WhatsApp
            </button>
          </div>

          {tab === "emails" && (
            <>
              <Select className="w-36" value={emailStatus} onChange={(e) => setEmailStatus(e.target.value)}>
                <option value="draft">{t("review.drafts")}</option>
                <option value="approved">{t("review.approved")}</option>
                <option value="sent">{t("review.sent")}</option>
                <option value="rejected">{t("review.rejected")}</option>
              </Select>
              {emailStatus === "draft" && emails.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> {bulkMode ? "Cancelar" : "Bulk"}
                </Button>
              )}
            </>
          )}

          {tab === "whatsapp" && (
            <>
              <Select className="w-36" value={waStatus} onChange={(e) => setWaStatus(e.target.value)}>
                <option value="draft">{t("review.drafts")}</option>
                <option value="approved">{t("review.approved")}</option>
                <option value="sent">{t("review.sent")}</option>
                <option value="rejected">{t("review.rejected")}</option>
              </Select>
              {waStatus === "draft" && waMessages.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => { setWaBulkMode(!waBulkMode); setWaSelectedIds(new Set()); }}>
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> {waBulkMode ? "Cancelar" : "Bulk"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══════════ EMAIL TAB ═══════════ */}
      {tab === "emails" && (
        <>
          {/* Bulk mode */}
          {bulkMode && emails.length > 0 && (
            <Card className="nd-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (selectedIds.size === emails.length) setSelectedIds(new Set());
                    else setSelectedIds(new Set(emails.map((e) => e.email.id)));
                  }}>
                    {selectedIds.size === emails.length ? t("common.deselectAll") : t("common.selectAll")}
                  </Button>
                  <span className="nd-label text-text-muted">{selectedIds.size} {t("common.selected")}</span>
                </div>
                <Button size="sm" variant="success" onClick={bulkApproveEmails} disabled={selectedIds.size === 0 || saving}>
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.approve")}
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {emails.map((row, i) => (
                  <label key={row.email.id} className={`flex items-center gap-3 py-2.5 cursor-pointer ${i > 0 ? "border-t border-border" : ""}`}>
                    <input type="checkbox" checked={selectedIds.has(row.email.id)} onChange={() => {
                      const next = new Set(selectedIds);
                      if (next.has(row.email.id)) next.delete(row.email.id); else next.add(row.email.id);
                      setSelectedIds(next);
                    }} className="rounded" />
                    <span className="text-sm text-text-primary flex-1 truncate">{row.leadName}</span>
                    <span className="nd-label text-text-muted truncate max-w-[200px]">{row.email.subject}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {!bulkMode && emails.length === 0 && (
            <EmptyState icon={<Mail className="h-10 w-10" strokeWidth={1.5} />} title={emailStatus === "draft" ? t("review.noEmailsTitle") : `${t("review.noEmailsTitle")}`} description={t("review.noEmailsDesc")} />
          )}

          {!bulkMode && current && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card>
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="ghost" disabled={emailIndex === 0} onClick={() => { setEmailIndex(i => i - 1); setEditMode(false); setShowRegen(false); }}>
                        <ChevronLeft className="h-4 w-4 text-accent" strokeWidth={1.5} />
                      </Button>
                      <span className="nd-label text-text-muted">{emailIndex + 1} {t("common.of")} {emails.length}</span>
                      <Button size="sm" variant="ghost" disabled={emailIndex >= emails.length - 1} onClick={() => { setEmailIndex(i => i + 1); setEditMode(false); setShowRegen(false); }}>
                        <ChevronRight className="h-4 w-4 text-accent" strokeWidth={1.5} />
                      </Button>
                    </div>
                    <StatusBadge status={current.email.status} />
                  </div>

                  {editMode ? (
                    <div className="space-y-4">
                      <div>
                        <label className="nd-label block mb-2">{t("common.subject")}</label>
                        <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
                      </div>
                      <div>
                        <label className="nd-label block mb-2">{t("leads.emailBody")}</label>
                        <Textarea rows={12} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                      </div>
                      <div className="flex gap-3">
                        <Button size="sm" onClick={saveEmailEdit} disabled={saving}>{t("common.save")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditMode(false)}>{t("common.cancel")}</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 mb-5">
                        <div className="flex items-baseline gap-3">
                          <span className="nd-label flex-shrink-0">{t("common.to")}</span>
                          <span className="text-sm text-text-primary font-mono">{current.email.toEmail}</span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="nd-label flex-shrink-0">{t("common.subject")}:</span>
                          <span className="text-sm text-text-display">{current.email.subject}</span>
                        </div>
                      </div>
                      <div className="border border-border rounded-lg px-5 py-4 text-sm text-text-primary leading-relaxed" dangerouslySetInnerHTML={{ __html: current.email.bodyHtml }} />
                    </>
                  )}

                  {current.email.status === "draft" && !editMode && (
                    <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                      <Button variant="success" size="sm" onClick={() => approveEmail(current.email.id)} disabled={saving}>
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.approve")}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={enterEmailEdit}>{t("common.edit")}</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setShowRegen(!showRegen); setRegenTone(current.email.tone); }}>
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("review.regenerate")}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => rejectEmail(current.email.id)} disabled={saving}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.reject")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={saveAsTemplate}>
                        <FileText className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("review.saveTemplate")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => sendTestEmail(current.email.id)} disabled={sendingTest}>
                        <Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {sendingTest ? t("review.sending") : t("review.sendTest")}
                      </Button>
                    </div>
                  )}

                  {showRegen && (
                    <div className="mt-4 p-4 border border-border rounded-lg space-y-4">
                      <div>
                        <label className="nd-label block mb-2">{t("review.newTone")}</label>
                        <Select value={regenTone} onChange={(e) => setRegenTone(e.target.value)}>
                          {["professional", "friendly", "direct", "consultative", "casual"].map((tone) => (
                            <option key={tone} value={tone}>{t(`tones.${tone}`)}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="nd-label block mb-2">{t("review.instructionsOptional")}</label>
                        <Input value={regenInstructions} onChange={(e) => setRegenInstructions(e.target.value)} placeholder={t("review.instructionsPlaceholder")} />
                      </div>
                      <Button size="sm" onClick={regenerateEmail} disabled={regenerating}>
                        {regenerating ? t("review.regenerating") : t("review.regenerateEmail")}
                      </Button>
                    </div>
                  )}
                </Card>
              </div>

              <div>
                <Card>
                  <h3 className="nd-label mb-5">{t("review.businessInfo")}</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[15px] text-text-display font-medium">{current.leadName}</h4>
                      {current.leadCategory && <p className="nd-label text-text-muted mt-1">{current.leadCategory}</p>}
                    </div>
                    {current.leadCity && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {current.leadCity}
                      </div>
                    )}
                    {current.leadWebsite && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" strokeWidth={1.5} />
                        <a href={current.leadWebsite.startsWith("http") ? current.leadWebsite : `https://${current.leadWebsite}`} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-text-display truncate transition-colors">{current.leadWebsite}</a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.quality")}</span>
                        <QualityBar score={current.leadScore} size="sm" />
                      </div>
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.opportunity")}</span>
                        <QualityBar score={current.leadOpportunity} size="sm" />
                      </div>
                    </div>
                    {current.leadAnalysisSummary && (
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.analysis")}</span>
                        <p className="text-[12px] text-text-primary leading-relaxed">{current.leadAnalysisSummary}</p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-border">
                      <span className="nd-label block mb-1.5">Tono</span>
                      <Badge>{current.email.tone.toUpperCase()}</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════ WHATSAPP TAB ═══════════ */}
      {tab === "whatsapp" && (
        <>
          {/* Bulk mode */}
          {waBulkMode && waMessages.length > 0 && (
            <Card className="nd-section">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (waSelectedIds.size === waMessages.length) setWaSelectedIds(new Set());
                    else setWaSelectedIds(new Set(waMessages.map((m) => m.message.id)));
                  }}>
                    {waSelectedIds.size === waMessages.length ? t("common.deselectAll") : t("common.selectAll")}
                  </Button>
                  <span className="nd-label text-text-muted">{waSelectedIds.size} {t("common.selected")}</span>
                </div>
                <Button size="sm" variant="success" onClick={bulkApproveWA} disabled={waSelectedIds.size === 0 || waSaving}>
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.approve")}
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {waMessages.map((row, i) => (
                  <label key={row.message.id} className={`flex items-center gap-3 py-2.5 cursor-pointer ${i > 0 ? "border-t border-border" : ""}`}>
                    <input type="checkbox" checked={waSelectedIds.has(row.message.id)} onChange={() => {
                      const next = new Set(waSelectedIds);
                      if (next.has(row.message.id)) next.delete(row.message.id); else next.add(row.message.id);
                      setWaSelectedIds(next);
                    }} className="rounded" />
                    <span className="text-sm text-text-primary flex-1 truncate">{row.leadName}</span>
                    <span className="nd-label text-text-muted truncate max-w-[250px]">{row.message.body.substring(0, 50)}...</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {!waBulkMode && waMessages.length === 0 && (
            <EmptyState icon={<MessageCircle className="h-10 w-10" strokeWidth={1.5} />} title={waStatus === "draft" ? t("review.noWasTitle") : `${t("review.noWasTitle")}`} description={t("review.noWasDesc")} />
          )}

          {!waBulkMode && currentWA && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card>
                  {/* Navigation */}
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="ghost" disabled={waIndex === 0} onClick={() => { setWaIndex(i => i - 1); setWaEditMode(false); setWaShowRegen(false); }}>
                        <ChevronLeft className="h-4 w-4 text-accent" strokeWidth={1.5} />
                      </Button>
                      <span className="nd-label text-text-muted">{waIndex + 1} {t("common.of")} {waMessages.length}</span>
                      <Button size="sm" variant="ghost" disabled={waIndex >= waMessages.length - 1} onClick={() => { setWaIndex(i => i + 1); setWaEditMode(false); setWaShowRegen(false); }}>
                        <ChevronRight className="h-4 w-4 text-accent" strokeWidth={1.5} />
                      </Button>
                    </div>
                    <StatusBadge status={currentWA.message.status} />
                  </div>

                  {/* Message content */}
                  <div className="space-y-2 mb-5">
                    <div className="flex items-baseline gap-3">
                      <span className="nd-label flex-shrink-0">{t("common.to")}</span>
                      <span className="text-sm text-text-primary font-mono">{currentWA.message.toPhone}</span>
                    </div>
                  </div>

                  {waEditMode ? (
                    <div className="space-y-4">
                      <div>
                        <label className="nd-label block mb-2">{t("review.message")}</label>
                        <Textarea rows={6} value={waEditBody} onChange={(e) => setWaEditBody(e.target.value)} />
                        <p className="text-[10px] text-text-muted font-mono mt-1">{waEditBody.length}/500 {t("common.characters")}</p>
                      </div>
                      <div className="flex gap-3">
                        <Button size="sm" onClick={saveWAEdit} disabled={waSaving}>{t("common.save")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => setWaEditMode(false)}>{t("common.cancel")}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg px-5 py-4">
                      <div className="bg-bg-tertiary rounded-lg px-4 py-3 max-w-md">
                        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{currentWA.message.body}</p>
                      </div>
                      <p className="text-[10px] text-text-muted font-mono mt-2">{currentWA.message.body.length} {t("common.characters")}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {currentWA.message.status === "draft" && !waEditMode && (
                    <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                      <Button variant="success" size="sm" onClick={() => approveWA(currentWA.message.id)} disabled={waSaving}>
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.approve")}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { setWaEditBody(currentWA.message.body); setWaEditMode(true); }}>{t("common.edit")}</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setWaShowRegen(!waShowRegen); setWaRegenTone(currentWA.message.tone); }}>
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("review.regenerate")}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => rejectWA(currentWA.message.id)} disabled={waSaving}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.reject")}
                      </Button>
                    </div>
                  )}

                  {currentWA.message.status === "approved" && (
                    <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
                      <Button variant="success" size="sm" onClick={() => sendWA(currentWA.message.id)} disabled={waSending}>
                        {waSending ? (
                          <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {t("review.sending")}</>
                        ) : (
                          <><Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("review.sendWa")}</>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Regenerate options */}
                  {waShowRegen && (
                    <div className="mt-4 p-4 border border-border rounded-lg space-y-4">
                      <div>
                        <label className="nd-label block mb-2">{t("review.newTone")}</label>
                        <Select value={waRegenTone} onChange={(e) => setWaRegenTone(e.target.value)}>
                          {["professional", "friendly", "direct", "consultative", "casual"].map((tone) => (
                            <option key={tone} value={tone}>{t(`tones.${tone}`)}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="nd-label block mb-2">{t("review.instructionsOptional")}</label>
                        <Input value={waRegenInstructions} onChange={(e) => setWaRegenInstructions(e.target.value)} placeholder={t("review.instructionsPlaceholder")} />
                      </div>
                      <Button size="sm" onClick={regenerateWA} disabled={waRegenerating}>
                        {waRegenerating ? t("review.regenerating") : t("review.regenerateWa")}
                      </Button>
                    </div>
                  )}
                </Card>
              </div>

              {/* Lead info sidebar */}
              <div>
                <Card>
                  <h3 className="nd-label mb-5">{t("review.businessInfo")}</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[15px] text-text-display font-medium">{currentWA.leadName}</h4>
                      {currentWA.leadCategory && <p className="nd-label text-text-muted mt-1">{currentWA.leadCategory}</p>}
                    </div>
                    {currentWA.leadCity && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {currentWA.leadCity}
                      </div>
                    )}
                    {currentWA.leadPhone && (
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {currentWA.leadPhone}
                      </div>
                    )}
                    {currentWA.leadWebsite && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" strokeWidth={1.5} />
                        <a href={currentWA.leadWebsite.startsWith("http") ? currentWA.leadWebsite : `https://${currentWA.leadWebsite}`} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-text-display truncate transition-colors">{currentWA.leadWebsite}</a>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.quality")}</span>
                        <QualityBar score={currentWA.leadScore} size="sm" />
                      </div>
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.opportunity")}</span>
                        <QualityBar score={currentWA.leadOpportunity} size="sm" />
                      </div>
                    </div>
                    {currentWA.leadAnalysisSummary && (
                      <div className="border border-border rounded-lg p-3">
                        <span className="nd-label block mb-1">{t("review.analysis")}</span>
                        <p className="text-[12px] text-text-primary leading-relaxed">{currentWA.leadAnalysisSummary}</p>
                      </div>
                    )}
                    <div className="pt-3 border-t border-border">
                      <span className="nd-label block mb-1.5">Tono</span>
                      <Badge>{currentWA.message.tone.toUpperCase()}</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
