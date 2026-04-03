"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, Select, StatusBadge, QualityBar, EmptyState, Spinner, Modal, Textarea, Badge } from "@/components/ui";
import { Users, Upload, Download, Search, ChevronLeft, ChevronRight, ExternalLink, MapPin, Star, Phone, Mail, Globe, FileText, MessageCircle, Zap, Send, RefreshCw } from "lucide-react";

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

function hasEmail(lead: Lead) { return !!(lead.contactEmail || lead.extractedEmail || lead.email); }
function hasPhone(lead: Lead) { return !!lead.phone; }
function isAnalyzed(lead: Lead) {
  return lead.analyzedAt !== null || ["analyzed", "email_generated", "email_approved", "email_sent", "wa_generated", "wa_approved", "wa_sent", "contacted"].includes(lead.status);
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filters, setFilters] = useState({ campaignId: "", city: "", status: "", search: "" });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCampaign, setImportCampaign] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDetail, setLeadDetail] = useState<{ lead: Lead; emails: unknown[]; whatsapps: unknown[]; activity: unknown[] } | null>(null);
  const [notes, setNotes] = useState("");
  // Outreach state
  const [analyzing, setAnalyzing] = useState(false);
  const [outreachMode, setOutreachMode] = useState<"none" | "email" | "whatsapp">("none");
  const [outreachMethod, setOutreachMethod] = useState<"ai" | "manual">("ai");
  const [outreachTone, setOutreachTone] = useState("profesional");
  const [manualSubject, setManualSubject] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Set<number>>(new Set());
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
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
      setImportResult(`Importados: ${data.imported} | Omitidos: ${data.skipped} | Blacklist: ${data.blacklisted}`);
      fetchLeads();
    } else {
      setImportResult(`Error: ${data.error}`);
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
        if (isModalLead) {
          setSelectedLead(data.lead);
          setOutreachResult("Analisis completado");
          const detailRes = await fetch(`/api/leads/${leadId}`);
          setLeadDetail(await detailRes.json());
        }
      } else {
        if (isModalLead) setOutreachResult(`Error: ${data.error}`);
      }
    } catch {
      if (isModalLead) setOutreachResult("Error al analizar");
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
          setOutreachResult(data.success ? "Email generado. Revisalo en la seccion de Revision." : `Error: ${data.error}`);
        } else {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_email", subject: manualSubject, bodyText: manualBody, tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? "Email creado como borrador." : `Error: ${data.error}`);
        }
      } else if (outreachMode === "whatsapp") {
        if (outreachMethod === "ai") {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "generate_wa", tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? "WhatsApp generado. Revisalo en la seccion de Revision." : `Error: ${data.error}`);
        } else {
          const res = await fetch(`/api/leads/${selectedLead.id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_wa", body: manualBody, tone: outreachTone }),
          });
          const data = await res.json();
          setOutreachResult(data.success ? "WhatsApp creado como borrador." : `Error: ${data.error}`);
        }
      }
      // Refresh lead detail
      const detailRes = await fetch(`/api/leads/${selectedLead.id}`);
      const detail = await detailRes.json();
      setLeadDetail(detail);
      setSelectedLead(detail.lead);
      fetchLeads();
    } catch {
      setOutreachResult("Error al procesar");
    }
    setGenerating(false);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>Leads</h1>
          <p className="nd-label mt-2">{total} negocios en total</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={analyzeAll} disabled={bulkAnalyzing}>
            {bulkAnalyzing
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {bulkProgress.done}/{bulkProgress.total}</>
              : <><Zap className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} /> Analizar todos</>
            }
          </Button>
          <Button variant="secondary" size="sm" onClick={exportLeads}>
            <Download className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} /> Exportar
          </Button>
          <Button size="sm" onClick={() => { setShowImport(true); setImportResult(null); }}>
            <Upload className="h-3.5 w-3.5" strokeWidth={1.5} /> Importar CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="nd-section">
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="nd-label block mb-2">Buscar</label>
              <div className="relative">
                <Search className="absolute left-0 top-2.5 h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
                <Input
                  className="pl-5"
                  placeholder="Nombre del negocio..."
                  value={filters.search}
                  onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
                />
              </div>
            </div>
            <div className="w-40">
              <label className="nd-label block mb-2">Campana</label>
              <Select value={filters.campaignId} onChange={(e) => { setFilters({ ...filters, campaignId: e.target.value }); setPage(1); }}>
                <option value="">Todas</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <label className="nd-label block mb-2">Ciudad</label>
              <Select value={filters.city} onChange={(e) => { setFilters({ ...filters, city: e.target.value }); setPage(1); }}>
                <option value="">Todas</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <label className="nd-label block mb-2">Estado</label>
              <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
                <option value="">Todos</option>
                <option value="imported">Importado</option>
                <option value="analyzed">Analizado</option>
                <option value="email_generated">Email generado</option>
                <option value="email_approved">Email aprobado</option>
                <option value="email_sent">Email enviado</option>
                <option value="wa_generated">WA generado</option>
                <option value="wa_approved">WA aprobado</option>
                <option value="wa_sent">WA enviado</option>
                <option value="contacted">Contactado</option>
                <option value="error">Error</option>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : leads.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" strokeWidth={1.5} />} title="Sin leads" description="Importa un CSV desde Google Maps para empezar" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="nd-table">
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Ciudad</th>
                  <th>Calidad</th>
                  <th>Oportunidad</th>
                  <th>Estado</th>
                  <th>Contacto</th>
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
                      <div className="text-sm text-text-primary">{lead.name}</div>
                      <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider mt-0.5">{lead.category}</div>
                    </td>
                    <td className="text-sm text-text-secondary">{lead.city || "—"}</td>
                    <td><QualityBar score={lead.webQualityScore} size="sm" /></td>
                    <td><QualityBar score={lead.opportunityScore} size="sm" /></td>
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
                            title="Analizar lead"
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
            <span className="nd-label text-text-muted">Pagina {page} de {totalPages}</span>
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

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar CSV">
        <div className="space-y-5">
          <div>
            <label className="nd-label block mb-2">Archivo CSV</label>
            <Input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="nd-label block mb-2">Campana (opcional)</label>
            <Select value={importCampaign} onChange={(e) => setImportCampaign(e.target.value)}>
              <option value="">Sin campana</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {importResult && (
            <p className={`text-[11px] font-mono ${importResult.includes("Error") ? "text-accent" : "text-success"}`}>{importResult}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleImport} disabled={!importFile || importing}>
              {importing ? "[IMPORTANDO...]" : "Importar"}
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
                  <Star className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} /> {selectedLead.rating} ({selectedLead.reviewCount} resenas)
                </div>
              )}
              <div><StatusBadge status={selectedLead.status} /></div>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label block mb-2">Calidad Web</span>
                <QualityBar score={selectedLead.webQualityScore} />
              </div>
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label block mb-2">Oportunidad</span>
                <QualityBar score={selectedLead.opportunityScore} />
              </div>
            </div>

            {/* Analysis */}
            {selectedLead.analysisSummary && (
              <div className="border border-border rounded-lg px-4 py-3">
                <span className="nd-label block mb-2">Analisis</span>
                <p className="text-sm text-text-primary leading-relaxed">{selectedLead.analysisSummary}</p>
              </div>
            )}

            {/* Outreach Actions */}
            <div className="border border-border rounded-lg px-4 py-4">
              <h3 className="nd-label mb-4">Acciones de contacto</h3>

              {/* Step 1: Analyze if not yet analyzed */}
              {!isAnalyzed(selectedLead) && (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    {selectedLead.website
                      ? "Analiza la web del negocio para obtener un puntaje y habilitar opciones de contacto."
                      : "Este negocio no tiene web. Analiza para calcular oportunidad."}
                  </p>
                  <Button size="sm" onClick={analyzeLead} disabled={analyzing}>
                    {analyzing ? (
                      <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> Analizando...</>
                    ) : (
                      <><Zap className="h-3.5 w-3.5" strokeWidth={1.5} /> Analizar lead</>
                    )}
                  </Button>
                </div>
              )}

              {/* Step 2: Choose outreach channel */}
              {isAnalyzed(selectedLead) && outreachMode === "none" && (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">Canales disponibles para contactar:</p>
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
                      <p className="text-sm text-text-muted">Sin datos de contacto disponibles</p>
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
                        {outreachMode === "email" ? "Nuevo Email" : "Nuevo WhatsApp"}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setOutreachMode("none")}>Volver</Button>
                  </div>

                  {/* Method toggle */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={outreachMethod === "ai" ? "primary" : "secondary"}
                      onClick={() => setOutreachMethod("ai")}
                    >
                      <Zap className="h-3 w-3" strokeWidth={1.5} /> Generar con IA
                    </Button>
                    <Button
                      size="sm"
                      variant={outreachMethod === "manual" ? "primary" : "secondary"}
                      onClick={() => setOutreachMethod("manual")}
                    >
                      Escribir manual
                    </Button>
                  </div>

                  {/* Tone selector */}
                  <div>
                    <label className="nd-label block mb-2">Tono</label>
                    <Select value={outreachTone} onChange={(e) => setOutreachTone(e.target.value)}>
                      <option value="profesional">Profesional</option>
                      <option value="amigable">Amigable</option>
                      <option value="directo">Directo</option>
                      <option value="consultivo">Consultivo</option>
                      <option value="casual">Casual</option>
                    </Select>
                  </div>

                  {/* Manual fields */}
                  {outreachMethod === "manual" && (
                    <div className="space-y-3">
                      {outreachMode === "email" && (
                        <div>
                          <label className="nd-label block mb-2">Asunto</label>
                          <Input value={manualSubject} onChange={(e) => setManualSubject(e.target.value)} placeholder="Asunto del email..." />
                        </div>
                      )}
                      <div>
                        <label className="nd-label block mb-2">
                          {outreachMode === "email" ? "Cuerpo del email" : "Mensaje de WhatsApp"}
                        </label>
                        <Textarea
                          rows={outreachMode === "email" ? 8 : 5}
                          value={manualBody}
                          onChange={(e) => setManualBody(e.target.value)}
                          placeholder={outreachMode === "email" ? "Escribe el email..." : "Escribe el mensaje de WhatsApp..."}
                        />
                        {outreachMode === "whatsapp" && (
                          <p className="text-[10px] text-text-muted font-mono mt-1">{manualBody.length}/500 caracteres</p>
                        )}
                      </div>
                    </div>
                  )}

                  {outreachMethod === "ai" && (
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      Se generara un {outreachMode === "email" ? "email" : "mensaje de WhatsApp"} personalizado con IA basado en el analisis del negocio. Podras revisarlo y editarlo antes de enviar.
                    </p>
                  )}

                  <Button
                    size="sm"
                    onClick={sendOutreach}
                    disabled={generating || (outreachMethod === "manual" && !manualBody)}
                  >
                    {generating ? (
                      <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {outreachMethod === "ai" ? "Generando..." : "Creando..."}</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {outreachMethod === "ai" ? "Generar borrador" : "Crear borrador"}</>
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

            {/* Notes */}
            <div>
              <label className="nd-label block mb-2">
                <FileText className="h-3 w-3 inline mr-1" strokeWidth={1.5} /> Notas
              </label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agregar notas sobre este negocio..."
              />
              <Button size="sm" variant="secondary" className="mt-3" onClick={saveNotes}>Guardar notas</Button>
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
