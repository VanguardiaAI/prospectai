"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Select, StatusBadge, QualityBar, EmptyState, Spinner, Modal, Textarea, Badge, Tooltip, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { Users, Upload, Download, Search, ChevronLeft, ChevronRight, ExternalLink, MapPin, Star, Phone, Mail, Globe, FileText, MessageCircle, Zap, Send, RefreshCw, Info, Activity, Trash2, ChevronDown, X } from "lucide-react";

interface Lead {
  id: number;
  campaignId: number | null;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  extractedEmail: string | null;
  contactEmail: string | null;
  webQualityScore: number | null;
  opportunityScore: number | null;
  analysisSummary: string | null;
  analysisJson: string | null;
  status: string;
  errorMessage: string | null;
  notes: string | null;
  importedAt: string;
  analyzedAt: string | null;
  emailSentAt: string | null;
  waSentAt: string | null;
}

interface Campaign {
  id: number;
  name: string;
}

interface EmailRecord {
  id: number;
  subject: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
}

interface WhatsappRecord {
  id: number;
  body: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

interface ActivityRecord {
  id: number;
  type: string;
  message: string;
  createdAt: string;
}

interface TimelineEvent {
  id: string;
  icon: "mail" | "whatsapp" | "activity";
  description: string;
  timestamp: string;
}

function buildTimeline(
  emails: EmailRecord[],
  whatsapps: WhatsappRecord[],
  activity: ActivityRecord[],
  t: (key: string) => string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const e of emails) {
    events.push({ id: `email-created-${e.id}`, icon: "mail", description: `${t("leads.timelineEmailCreated")} "${e.subject}" (${e.status})`, timestamp: e.createdAt });
    if (e.sentAt) events.push({ id: `email-sent-${e.id}`, icon: "mail", description: `${t("leads.timelineEmailSent")} "${e.subject}"`, timestamp: e.sentAt });
    if (e.openedAt) events.push({ id: `email-opened-${e.id}`, icon: "mail", description: `${t("leads.timelineEmailOpened")} "${e.subject}"`, timestamp: e.openedAt });
    if (e.clickedAt) events.push({ id: `email-clicked-${e.id}`, icon: "mail", description: `${t("leads.timelineEmailClicked")} "${e.subject}"`, timestamp: e.clickedAt });
  }

  for (const w of whatsapps) {
    events.push({ id: `wa-created-${w.id}`, icon: "whatsapp", description: `${t("leads.timelineWaCreated")} (${w.status})`, timestamp: w.createdAt });
    if (w.sentAt) events.push({ id: `wa-sent-${w.id}`, icon: "whatsapp", description: t("leads.timelineWaSent"), timestamp: w.sentAt });
  }

  for (const a of activity) {
    events.push({ id: `activity-${a.id}`, icon: "activity", description: a.message, timestamp: a.createdAt });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

function hasEmail(lead: Lead) { return !!(lead.contactEmail || lead.extractedEmail || lead.email); }
function hasPhone(lead: Lead) { return !!lead.phone; }
function isAnalyzed(lead: Lead) {
  return lead.analyzedAt !== null || ["analyzed", "email_generated", "email_approved", "email_sent", "wa_generated", "wa_approved", "wa_sent", "contacted", "replied"].includes(lead.status);
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><Spinner size="lg" /></div>}>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filters, setFilters] = useState({
    campaignId: "",
    city: searchParams.get("city") ?? "",
    status: searchParams.get("status") ?? "",
    search: searchParams.get("search") ?? "",
  });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCampaign, setImportCampaign] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDetail, setLeadDetail] = useState<{ lead: Lead; emails: EmailRecord[]; whatsapps: WhatsappRecord[]; activity: ActivityRecord[] } | null>(null);
  const [notes, setNotes] = useState("");
  // Outreach state
  const [analyzing, setAnalyzing] = useState(false);
  const [outreachMode, setOutreachMode] = useState<"none" | "email" | "whatsapp">("none");
  const [outreachMethod, setOutreachMethod] = useState<"ai" | "manual">("ai");
  const [outreachTone, setOutreachTone] = useState("professional");
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const limit = 50;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.city) params.set("city", filters.city);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads);
    setTotal(data.total);
    setCities(data.cities);
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(setCampaigns);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", importFile);
    if (importCampaign) fd.append("campaignId", importCampaign);

    const res = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json();
    setImporting(false);

    if (data.success) {
      setImportResult(`${t("leads.imported")}: ${data.imported} | ${t("leads.import")}: ${data.skipped} | Blacklist: ${data.blacklisted} | Dup: ${data.duplicates ?? 0}`);
      toast(`${data.imported} leads ${t("leads.imported").toLowerCase()}`, "success");
      fetchLeads();
    } else {
      setImportResult(`Error: ${data.error}`);
      toast(`${t("common.error")}: ${data.error}`, "error");
    }
  };

  const openDetail = async (lead: Lead) => {
    setSelectedLead(lead);
    setNotes(lead.notes || "");
    setOutreachMode("none");
    setOutreachResult(null);
    const res = await fetch(`/api/leads/${lead.id}`);
    const detail = await res.json();
    setLeadDetail(detail);
    setSelectedLead(detail.lead); // refresh with latest data
  };

  const saveNotes = async () => {
    if (!selectedLead) return;
    await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selectedLead.id, notes }),
    });
    fetchLeads();
  };

  const exportLeads = () => {
    const params = new URLSearchParams();
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.status) params.set("status", filters.status);
    window.open(`/api/export?${params}`, "_blank");
  };

  // Analyze a lead by ID — used from table row and modal
  const analyzeLeadById = async (leadId: number) => {
    const isModalLead = selectedLead?.id === leadId;
    setAnalyzingIds(prev => new Set([...prev, leadId]));
    if (isModalLead) { setAnalyzing(true); setOutreachResult(null); }
    try {
      const res = await fetch(`/api/leads/${leadId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const data = await res.json();
      if (data.success) {
        setLeads(prev => prev.map(l => l.id === leadId ? data.lead : l));
        toast(t("leads.analysisCompleted"), "success");
        if (isModalLead) {
          setSelectedLead(data.lead);
          setOutreachResult(t("leads.analysisCompleted"));
          const detailRes = await fetch(`/api/leads/${leadId}`);
          setLeadDetail(await detailRes.json());
        }
      } else {
        toast(`${t("leads.analysisError")}: ${data.error}`, "error");
        if (isModalLead) setOutreachResult(`${t("common.error")}: ${data.error}`);
      }
    } catch {
      toast(t("leads.analysisError"), "error");
      if (isModalLead) setOutreachResult(t("leads.analysisError"));
    }
    setAnalyzingIds(prev => { const s = new Set(prev); s.delete(leadId); return s; });
    if (isModalLead) setAnalyzing(false);
  };

  const analyzeLead = () => { if (selectedLead) analyzeLeadById(selectedLead.id); };

  // Analyze all leads with website that haven't been analyzed yet
  const analyzeAll = async () => {
    setBulkAnalyzing(true);
    const res = await fetch("/api/leads?limit=500");
    const data = await res.json();
    const toAnalyze = (data.leads as Lead[]).filter(l => l.website && !isAnalyzed(l));
    setBulkProgress({ done: 0, total: toAnalyze.length });
    for (let i = 0; i < toAnalyze.length; i++) {
      setBulkProgress({ done: i, total: toAnalyze.length });
      try {
        const r = await fetch(`/api/leads/${toAnalyze[i].id}/outreach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "analyze" }),
        });
        const d = await r.json();
        if (d.success) setLeads(prev => prev.map(l => l.id === toAnalyze[i].id ? d.lead : l));
      } catch { /* continue with next */ }
      setBulkProgress({ done: i + 1, total: toAnalyze.length });
    }
    setBulkAnalyzing(false);
    setBulkProgress({ done: 0, total: 0 });
    fetchLeads();
  };

  // Bulk operations
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  };

  const bulkChangeStatus = async (status: string) => {
    const ids = Array.from(selectedIds);
    try {
      await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulkIds: ids, status }),
      });
      toast(t("leads.leadsUpdated").replace("{{count}}", String(ids.length)).replace("{{status}}", status), "success");
      setSelectedIds(new Set());
      setShowStatusDropdown(false);
      fetchLeads();
    } catch {
      toast(t("leads.updateError"), "error");
    }
  };

  const bulkAssignCampaign = async (campaignId: number) => {
    const ids = Array.from(selectedIds);
    try {
      await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulkIds: ids, campaignId }),
      });
      toast(t("leads.leadsAssigned").replace("{{count}}", String(ids.length)), "success");
      setSelectedIds(new Set());
      setShowCampaignDropdown(false);
      fetchLeads();
    } catch {
      toast(t("leads.assignError"), "error");
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulkIds: ids }),
      });
      toast(t("leads.leadsDeleted").replace("{{count}}", String(ids.length)), "success");
      setSelectedIds(new Set());
      fetchLeads();
    } catch {
      toast(t("leads.deleteError"), "error");
    }
  };

  // Outreach: generate or create message
  const sendOutreach = async () => {
    if (!selectedLead) return;
    setGenerating(true);
    setOutreachResult(null);

    try {
      if (outreachMode === "email") {
        if (outreachMethod === "ai") {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate_email", tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? t("leads.emailGeneratedMsg") : `${t("common.error")}: ${data.error}`);
        } else {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_email", subject: manualSubject, bodyText: manualBody, tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? t("leads.emailCreatedMsg") : `${t("common.error")}: ${data.error}`);
        }
      } else if (outreachMode === "whatsapp") {
        if (outreachMethod === "ai") {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate_wa", tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? t("leads.waGeneratedMsg") : `${t("common.error")}: ${data.error}`);
        } else {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_wa", body: manualBody, tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? t("leads.waCreatedMsg") : `${t("common.error")}: ${data.error}`);
        }
      }
      // Refresh lead detail
      const detailRes = await fetch(`/api/leads/${selectedLead.id}`);
      const detail = await detailRes.json();
      setLeadDetail(detail);
      setSelectedLead(detail.lead);
      fetchLeads();
    } catch {
      setOutreachResult(t("leads.processError"));
    }
    setGenerating(false);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>{t("leads.title")}</h1>
          <p className="nd-label mt-2">{total} {t("leads.totalBusinesses")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={analyzeAll} disabled={bulkAnalyzing}>
            {bulkAnalyzing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {bulkProgress.done}/{bulkProgress.total}</>
              : <><Zap className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} /> {t("leads.analyzeAll")}</>
            }
          </Button>
          <Button variant="secondary" size="sm" onClick={exportLeads}>
            <Download className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} /> {t("leads.export")}
          </Button>
          <Button size="sm" onClick={() => { setShowImport(true); setImportResult(null); }}>
            <Upload className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("leads.importCsv")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="nd-section">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="nd-label block mb-2">{t("leads.search")}</label>
              <div className="relative">
                <Search className="absolute left-0 top-2.5 h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
                <Input
                  className="pl-5"
                  placeholder={t("leads.businessNamePlaceholder")}
                  value={filters.search}
                  onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
                />
              </div>
            </div>
            <div className="w-40">
              <label className="nd-label block mb-2">{t("common.campaign")}</label>
              <Select value={filters.campaignId} onChange={(e) => { setFilters({ ...filters, campaignId: e.target.value }); setPage(1); }}>
                <option value="">{t("leads.allCampaigns")}</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <label className="nd-label block mb-2">{t("common.city")}</label>
              <Select value={filters.city} onChange={(e) => { setFilters({ ...filters, city: e.target.value }); setPage(1); }}>
                <option value="">{t("leads.allCities")}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <label className="nd-label block mb-2">{t("common.status")}</label>
              <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
                <option value="">{t("leads.allStatuses")}</option>
                <option value="imported">{t("leads.imported")}</option>
                <option value="analyzed">{t("leads.analyzed")}</option>
                <option value="email_generated">{t("leads.emailGenerated")}</option>
                <option value="email_approved">{t("leads.emailApproved")}</option>
                <option value="email_sent">{t("leads.emailSent")}</option>
                <option value="wa_generated">{t("leads.waGenerated")}</option>
                <option value="wa_approved">{t("leads.waApproved")}</option>
                <option value="wa_sent">{t("leads.waSent")}</option>
                <option value="contacted">{t("leads.contacted")}</option>
                <option value="replied">{t("leads.replied")}</option>
                <option value="error">{t("leads.error")}</option>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={<Users className="h-10 w-10" strokeWidth={1.5} />}
          title={t("leads.noLeads")}
          description={t("leads.noLeadsDesc")}
          action={
            <div className="flex gap-3">
              <Button size="sm" onClick={() => setShowImport(true)}><Upload className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("leads.importCsv")}</Button>
              <Button size="sm" variant="secondary" onClick={() => window.location.href = "/search"}><Search className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("leads.searchMaps")}</Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="nd-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onChange={toggleSelectAll}
                      className="accent-[var(--color-accent)] cursor-pointer"
                    />
                  </th>
                  <th>{t("leads.business")}</th>
                  <th>{t("common.city")}</th>
                  <th><span className="inline-flex items-center gap-1">{t("leads.quality")} <Tooltip text={t("leads.qualityTooltip")}><Info className="h-3 w-3 text-text-muted" strokeWidth={1.5} /></Tooltip></span></th>
                  <th><span className="inline-flex items-center gap-1">{t("leads.opportunity")} <Tooltip text={t("leads.opportunityTooltip")}><Info className="h-3 w-3 text-text-muted" strokeWidth={1.5} /></Tooltip></span></th>
                  <th>{t("common.status")}</th>
                  <th>{t("leads.contact")}</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(lead)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[var(--color-accent)] cursor-pointer"
                      />
                    </td>
                    <td>
                      <div className="text-sm text-text-primary">{lead.name}</div>
                      <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider mt-0.5">{lead.category}</div>
                    </td>
                    <td className="text-sm text-text-secondary">{lead.city || "—"}</td>
                    <td><Tooltip text={t("leads.qualityTooltip")}><QualityBar score={lead.webQualityScore} size="sm" /></Tooltip></td>
                    <td><Tooltip text={t("leads.opportunityTooltip")}><QualityBar score={lead.opportunityScore} size="sm" /></Tooltip></td>
                    <td><StatusBadge status={lead.status} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        {hasEmail(lead) && <Mail className="h-3 w-3 text-text-muted" strokeWidth={1.5} />}
                        {hasPhone(lead) && <MessageCircle className="h-3 w-3 text-text-muted" strokeWidth={1.5} />}
                        {!hasEmail(lead) && !hasPhone(lead) && <span className="text-[10px] text-text-muted font-mono">—</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {!isAnalyzed(lead) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); analyzeLeadById(lead.id); }}
                            disabled={analyzingIds.has(lead.id) || bulkAnalyzing}
                            title={t("leads.analyzeLead")}
                            className="text-text-muted hover:text-accent transition-colors disabled:opacity-40"
                          >
                            {analyzingIds.has(lead.id)
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.5} />
                              : <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
                            }
                          </button>
                        )}
                        {lead.website && (
                          <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="h-3.5 w-3.5 text-text-muted hover:text-text-primary transition-colors" strokeWidth={1.5} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <span className="nd-label text-text-muted">{t("common.page")} {page} {t("common.of")} {totalPages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-bg-secondary border border-border-light rounded-[12px] shadow-lg px-5 py-3 flex items-center gap-4">
          <span className="text-sm text-text-primary font-medium whitespace-nowrap">{selectedIds.size} {t("common.selected")}</span>
          <div className="w-px h-6 bg-border" />

          {/* Cambiar estado */}
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => { setShowStatusDropdown(v => !v); setShowCampaignDropdown(false); }}>
              {t("leads.changeStatus")} <ChevronDown className="h-3 w-3 ml-1" strokeWidth={1.5} />
            </Button>
            {showStatusDropdown && (
              <div className="absolute bottom-full mb-2 left-0 bg-bg-secondary border border-border-light rounded-lg shadow-lg py-1 min-w-[160px] z-10">
                {["imported", "analyzed", "contacted"].map(s => (
                  <button key={s} onClick={() => bulkChangeStatus(s)} className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary hover:text-text-primary transition-colors">
                    {s === "imported" ? t("leads.imported") : s === "analyzed" ? t("leads.analyzed") : t("leads.contacted")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Asignar campana */}
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => { setShowCampaignDropdown(v => !v); setShowStatusDropdown(false); }}>
              {t("leads.assignCampaign")} <ChevronDown className="h-3 w-3 ml-1" strokeWidth={1.5} />
            </Button>
            {showCampaignDropdown && (
              <div className="absolute bottom-full mb-2 left-0 bg-bg-secondary border border-border-light rounded-lg shadow-lg py-1 min-w-[180px] z-10 max-h-48 overflow-y-auto">
                {campaigns.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-text-muted">{t("leads.noCampaigns")}</p>
                ) : (
                  campaigns.map(c => (
                    <button key={c.id} onClick={() => bulkAssignCampaign(c.id)} className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary hover:text-text-primary transition-colors">
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Eliminar */}
          <Button size="sm" variant="danger" onClick={() => { setConfirmBulkDelete(true); setShowStatusDropdown(false); setShowCampaignDropdown(false); }}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("common.delete")}
          </Button>

          <div className="w-px h-6 bg-border" />
          <button onClick={() => setSelectedIds(new Set())} className="text-text-muted hover:text-text-primary transition-colors" title={t("common.deselectAll")}>
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={bulkDelete}
        title={t("leads.deleteLeads")}
        message={t("leads.deleteLeadsConfirm").replace("{{count}}", String(selectedIds.size))}
        confirmLabel={t("common.delete")}
        variant="danger"
      />

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title={t("leads.importCsv")}>
        <div className="space-y-5">
          <div>
            <label className="nd-label block mb-2">{t("leads.csvFile")}</label>
            <Input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="nd-label block mb-2">{t("leads.campaignOptional")}</label>
            <Select value={importCampaign} onChange={(e) => setImportCampaign(e.target.value)}>
              <option value="">{t("leads.noCampaign")}</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {importResult && (
            <p className={`text-[11px] font-mono ${importResult.includes("Error") ? "text-accent" : "text-success"}`}>{importResult}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleImport} disabled={!importFile || importing}>
              {importing ? t("common.importing") : t("leads.import")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lead Detail Modal */}
      <Modal open={!!selectedLead} onClose={() => { setSelectedLead(null); setLeadDetail(null); setOutreachMode("none"); }} title={selectedLead?.name || ""} maxWidth="max-w-3xl">
        {selectedLead && (
          <div className="space-y-6">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {selectedLead.city}, {selectedLead.state}
              </div>
              {selectedLead.phone && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {selectedLead.phone}
                </div>
              )}
              {(selectedLead.contactEmail || selectedLead.email) && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {selectedLead.contactEmail || selectedLead.email}
                </div>
              )}
              {selectedLead.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-text-secondary flex-shrink-0" strokeWidth={1.5} />
                  <a href={selectedLead.website.startsWith("http") ? selectedLead.website : `https://${selectedLead.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-text-primary hover:text-text-display truncate transition-colors">
                    {selectedLead.website}
                  </a>
                </div>
              )}
              {selectedLead.rating && (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Star className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {selectedLead.rating} ({selectedLead.reviewCount} {t("leads.reviews")})
                </div>
              )}
              <div><StatusBadge status={selectedLead.status} /></div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label mb-2 inline-flex items-center gap-1">{t("leads.webQuality")} <Tooltip text={t("leads.qualityTooltip")}><Info className="h-3 w-3 text-text-muted" strokeWidth={1.5} /></Tooltip></span>
                <Tooltip text={t("leads.qualityTooltip")}><QualityBar score={selectedLead.webQualityScore} /></Tooltip>
              </div>
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label mb-2 inline-flex items-center gap-1">{t("leads.opportunity")} <Tooltip text={t("leads.opportunityTooltip")}><Info className="h-3 w-3 text-text-muted" strokeWidth={1.5} /></Tooltip></span>
                <Tooltip text={t("leads.opportunityTooltip")}><QualityBar score={selectedLead.opportunityScore} /></Tooltip>
              </div>
            </div>

            {/* Analysis */}
            {selectedLead.analysisSummary && (
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label block mb-2">{t("review.analysis")}</span>
                <p className="text-sm text-text-primary leading-relaxed">{selectedLead.analysisSummary}</p>
              </div>
            )}

            {/* Outreach Actions */}
            <div className="border border-border rounded-lg px-4 py-4">
              <h3 className="nd-label mb-4">{t("leads.contactActions")}</h3>

              {/* Step 1: Analyze if not yet analyzed */}
              {!isAnalyzed(selectedLead) && (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    {selectedLead.website
                      ? t("leads.analyzeDesc")
                      : t("leads.noWebDesc")}
                  </p>
                  <Button size="sm" onClick={analyzeLead} disabled={analyzing}>
                    {analyzing ? (
                      <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {t("leads.analyzing")}</>
                    ) : (
                      <><Zap className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("leads.analyzeLead")}</>
                    )}
                  </Button>
                </div>
              )}

              {/* Step 2: Choose outreach channel */}
              {isAnalyzed(selectedLead) && outreachMode === "none" && (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">{t("leads.availableChannels")}</p>
                  <div className="flex gap-2">
                    {hasEmail(selectedLead) && (
                      <Button size="sm" variant="secondary" onClick={() => { setOutreachMode("email"); setManualSubject(""); setManualBody(""); setOutreachResult(null); }}>
                        <Mail className="h-3.5 w-3.5" strokeWidth={1.5} /> Email
                      </Button>
                    )}
                    {hasPhone(selectedLead) && (
                      <Button size="sm" variant="secondary" onClick={() => { setOutreachMode("whatsapp"); setManualBody(""); setOutreachResult(null); }}>
                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> WhatsApp
                      </Button>
                    )}
                    {!hasEmail(selectedLead) && !hasPhone(selectedLead) && (
                      <p className="text-sm text-text-muted">{t("leads.noContactData")}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Configure and send */}
              {isAnalyzed(selectedLead) && outreachMode !== "none" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {outreachMode === "email" ? <Mail className="h-4 w-4 text-accent" strokeWidth={1.5} /> : <MessageCircle className="h-4 w-4 text-accent" strokeWidth={1.5} />}
                      <span className="text-sm text-text-display font-medium">
                        {outreachMode === "email" ? t("leads.newEmail") : t("leads.newWhatsApp")}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setOutreachMode("none")}>{t("common.back")}</Button>
                  </div>

                  {/* Method toggle */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={outreachMethod === "ai" ? "primary" : "secondary"}
                      onClick={() => setOutreachMethod("ai")}
                    >
                      <Zap className="h-3 w-3" strokeWidth={1.5} /> {t("leads.generateWithAi")}
                    </Button>
                    <Button
                      size="sm"
                      variant={outreachMethod === "manual" ? "primary" : "secondary"}
                      onClick={() => setOutreachMethod("manual")}
                    >
                      {t("leads.writeManual")}
                    </Button>
                  </div>

                  {/* Tone selector */}
                  <div>
                    <label className="nd-label block mb-2">{t("common.tone")}</label>
                    <Select value={outreachTone} onChange={(e) => setOutreachTone(e.target.value)}>
                      <option value="professional">{t("tones.professional")}</option>
                      <option value="friendly">{t("tones.friendly")}</option>
                      <option value="direct">{t("tones.direct")}</option>
                      <option value="consultative">{t("tones.consultative")}</option>
                      <option value="casual">{t("tones.casual")}</option>
                    </Select>
                  </div>

                  {/* Manual fields */}
                  {outreachMethod === "manual" && (
                    <div className="space-y-3">
                      {outreachMode === "email" && (
                        <div>
                          <label className="nd-label block mb-2">{t("common.subject")}</label>
                          <Input value={manualSubject} onChange={(e) => setManualSubject(e.target.value)} placeholder={t("leads.subjectPlaceholder")} />
                        </div>
                      )}
                      <div>
                        <label className="nd-label block mb-2">
                          {outreachMode === "email" ? t("leads.emailBody") : t("leads.waBody")}
                        </label>
                        <Textarea
                          rows={outreachMode === "email" ? 8 : 5}
                          value={manualBody}
                          onChange={(e) => setManualBody(e.target.value)}
                          placeholder={outreachMode === "email" ? t("leads.emailBodyPlaceholder") : t("leads.waBodyPlaceholder")}
                        />
                        {outreachMode === "whatsapp" && (
                          <p className="text-[10px] text-text-muted font-mono mt-1">{manualBody.length}/500 {t("common.characters")}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {outreachMethod === "ai" && (
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      {t("leads.aiGenerateDesc").replace("{{channel}}", outreachMode === "email" ? t("common.email").toLowerCase() : t("common.whatsapp"))}
                    </p>
                  )}

                  <Button
                    size="sm"
                    onClick={sendOutreach}
                    disabled={generating || (outreachMethod === "manual" && !manualBody)}
                  >
                    {generating ? (
                      <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {outreachMethod === "ai" ? t("common.generating") : t("common.creating")}</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {outreachMethod === "ai" ? t("leads.generateDraft") : t("leads.createDraft")}</>
                    )}
                  </Button>
                </div>
              )}

              {/* Result feedback */}
              {outreachResult && (
                <p className={`text-[11px] font-mono mt-3 ${outreachResult.includes("Error") ? "text-accent" : "text-success"}`}>
                  {outreachResult}
                </p>
              )}
            </div>

            {/* Timeline */}
            {leadDetail && (() => {
              const timelineEvents = buildTimeline(leadDetail.emails, leadDetail.whatsapps, leadDetail.activity, t);
              if (timelineEvents.length === 0) return null;
              return (
                <div className="border border-border rounded-lg px-4 py-4">
                  <h3 className="nd-label mb-4">{t("leads.timeline")}</h3>
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                    <div className="space-y-4">
                      {timelineEvents.map((evt) => (
                        <div key={evt.id} className="flex items-start gap-3 relative">
                          <div className="relative z-10 flex-shrink-0 w-[23px] h-[23px] rounded-full bg-bg-secondary border border-border flex items-center justify-center">
                            {evt.icon === "mail" && <Mail className="h-3 w-3 text-text-muted" strokeWidth={1.5} />}
                            {evt.icon === "whatsapp" && <MessageCircle className="h-3 w-3 text-text-muted" strokeWidth={1.5} />}
                            {evt.icon === "activity" && <Activity className="h-3 w-3 text-text-muted" strokeWidth={1.5} />}
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-sm text-text-primary leading-snug truncate">{evt.description}</p>
                            <p className="text-[10px] font-mono text-text-muted mt-0.5">{evt.timestamp}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Notes */}
            <div>
              <label className="nd-label block mb-2">
                <FileText className="h-3 w-3 inline mr-1" strokeWidth={1.5} /> {t("leads.notes")}
              </label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("leads.notesPlaceholder")}
              />
              <Button size="sm" variant="secondary" className="mt-3" onClick={saveNotes}>{t("leads.saveNotes")}</Button>
            </div>

            {/* Error */}
            {selectedLead.errorMessage && (
              <div className="border border-accent/30 rounded-lg px-4 py-3 bg-accent-subtle">
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent">[ERROR] </span>
                <span className="text-sm text-text-secondary">{selectedLead.errorMessage}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
