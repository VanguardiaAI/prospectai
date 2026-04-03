"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Badge, Modal, Input, Textarea, Select, EmptyState, Spinner } from "@/components/ui";
import { FileText, Plus, Edit, Trash2, Mail, Eye, Sparkles, MessageCircle, Copy } from "lucide-react";

interface Template {
  id: number;
  name: string;
  channel: "email" | "whatsapp";
  category: string | null;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string;
  variables: string;
  usageCount: number;
  avgOpenRate: number | null;
  createdAt: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseVariables(vars: string): string[] {
  try {
    const parsed = JSON.parse(vars);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TONES = [
  { value: "profesional", label: "Profesional" },
  { value: "cercano", label: "Cercano" },
  { value: "directo", label: "Directo" },
  { value: "consultivo", label: "Consultivo" },
  { value: "casual", label: "Casual" },
];

const PURPOSES = [
  { value: "initial", label: "Primer contacto" },
  { value: "follow_up", label: "Follow-up" },
  { value: "breakup", label: "Despedida" },
];

const INDUSTRIES = [
  "Restaurantes y hostelería",
  "Clínicas y salud",
  "Inmobiliarias",
  "Tiendas y retail",
  "Gimnasios y fitness",
  "Peluquerías y estética",
  "Hoteles y turismo",
  "Despachos y asesorías",
  "Talleres y automoción",
  "Academias y formación",
  "Veterinarias",
  "Construcción y reformas",
  "Otro",
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"email" | "whatsapp">("email");

  // Manual create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "email" as "email" | "whatsapp",
    category: "",
    subjectTemplate: "",
    bodyHtmlTemplate: "",
    bodyTextTemplate: "",
    variables: "",
  });

  // AI generation modal
  const [showAiModal, setShowAiModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    channel: "email" as "email" | "whatsapp",
    industry: INDUSTRIES[0],
    customIndustry: "",
    purpose: "initial" as "initial" | "follow_up" | "breakup",
    tone: "profesional",
    customInstructions: "",
  });
  const [aiResult, setAiResult] = useState<{
    channel: "email" | "whatsapp";
    name: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    message?: string;
    variables: string[];
  } | null>(null);
  const [savingAi, setSavingAi] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter(
    (t) => (t.channel || "email") === activeTab
  );

  // --- Manual create/edit ---
  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      channel: activeTab,
      category: "",
      subjectTemplate: "",
      bodyHtmlTemplate: "",
      bodyTextTemplate: "",
      variables: "",
    });
    setShowModal(true);
  };

  const openEdit = (t: Template) => {
    setEditing(t);
    const vars = parseVariables(t.variables);
    setForm({
      name: t.name,
      channel: t.channel || "email",
      category: t.category || "",
      subjectTemplate: t.subjectTemplate,
      bodyHtmlTemplate: t.bodyHtmlTemplate,
      bodyTextTemplate: t.bodyTextTemplate,
      variables: vars.join(", "),
    });
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true);
    const variablesArray = form.variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    const payload = {
      name: form.name,
      channel: form.channel,
      category: form.category || null,
      subjectTemplate: form.subjectTemplate,
      bodyHtmlTemplate: form.bodyHtmlTemplate,
      bodyTextTemplate: form.bodyTextTemplate,
      variables: JSON.stringify(variablesArray),
    };

    if (editing) {
      await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...payload }),
      });
    } else {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
    setShowModal(false);
    fetchTemplates();
  };

  const remove = async (id: number) => {
    if (!confirm("Eliminar este template?")) return;
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  // --- AI Generation ---
  const openAiGenerate = () => {
    setAiForm({
      channel: activeTab,
      industry: INDUSTRIES[0],
      customIndustry: "",
      purpose: "initial",
      tone: "profesional",
      customInstructions: "",
    });
    setAiResult(null);
    setShowAiModal(true);
  };

  const generate = async () => {
    setGenerating(true);
    setAiResult(null);
    try {
      const industry = aiForm.industry === "Otro" ? aiForm.customIndustry : aiForm.industry;
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: aiForm.channel,
          industry,
          purpose: aiForm.purpose,
          tone: aiForm.tone,
          customInstructions: aiForm.customInstructions || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error generando template");
        return;
      }
      const data = await res.json();
      setAiResult(data);
    } catch {
      alert("Error de conexión");
    } finally {
      setGenerating(false);
    }
  };

  const saveAiResult = async () => {
    if (!aiResult) return;
    setSavingAi(true);

    const payload = {
      name: aiResult.name,
      channel: aiResult.channel,
      category: aiForm.industry === "Otro" ? aiForm.customIndustry : aiForm.industry,
      subjectTemplate: aiResult.subject || "-",
      bodyHtmlTemplate: aiResult.bodyHtml || aiResult.message || "",
      bodyTextTemplate: aiResult.bodyText || aiResult.message || "",
      variables: JSON.stringify(aiResult.variables),
    };

    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSavingAi(false);
    setShowAiModal(false);
    setAiResult(null);
    fetchTemplates();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1 className="nd-heading">Templates</h1>
          <p className="nd-label mt-2">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""} de{" "}
            {activeTab === "email" ? "email" : "WhatsApp"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={openAiGenerate}>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> Generar con IA
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Nuevo template
          </Button>
        </div>
      </div>

      {/* Channel tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("email")}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.06em] transition-colors cursor-pointer border-b-2 ${
            activeTab === "email"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text-secondary"
          }`}
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
          Email ({templates.filter((t) => (t.channel || "email") === "email").length})
        </button>
        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.06em] transition-colors cursor-pointer border-b-2 ${
            activeTab === "whatsapp"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text-secondary"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
          WhatsApp ({templates.filter((t) => t.channel === "whatsapp").length})
        </button>
      </div>

      {/* Templates grid */}
      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon={
            activeTab === "email" ? (
              <FileText className="h-10 w-10" strokeWidth={1.5} />
            ) : (
              <MessageCircle className="h-10 w-10" strokeWidth={1.5} />
            )
          }
          title={`Sin templates de ${activeTab === "email" ? "email" : "WhatsApp"}`}
          description={`Crea tu primer template de ${activeTab === "email" ? "email" : "WhatsApp"} manualmente o genera uno con IA`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((t) => {
            const vars = parseVariables(t.variables);
            const isWhatsApp = t.channel === "whatsapp";
            const bodyPreview = stripHtml(
              isWhatsApp ? t.bodyTextTemplate : (t.bodyHtmlTemplate || t.bodyTextTemplate)
            ).slice(0, 200);

            return (
              <Card key={t.id} className="flex flex-col">
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {isWhatsApp ? (
                        <MessageCircle className="h-3.5 w-3.5 text-success flex-shrink-0" strokeWidth={1.5} />
                      ) : (
                        <Mail className="h-3.5 w-3.5 text-text-muted flex-shrink-0" strokeWidth={1.5} />
                      )}
                      <h3 className="text-[15px] text-text-display font-medium truncate">
                        {t.name}
                      </h3>
                    </div>
                    <p className="text-[10px] text-text-muted font-mono mt-1">
                      {new Date(t.createdAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {t.category && <Badge>{t.category}</Badge>}
                </div>

                {/* Subject preview (email only) */}
                {!isWhatsApp && (
                  <div className="mb-3">
                    <span className="nd-label block mb-1">Asunto</span>
                    <p className="text-[12px] text-text-primary font-mono truncate">
                      {t.subjectTemplate}
                    </p>
                  </div>
                )}

                {/* Body preview */}
                <div className="flex-1 mb-4">
                  <span className="nd-label block mb-1">
                    {isWhatsApp ? "Mensaje" : "Preview"}
                  </span>
                  <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-4">
                    {bodyPreview}
                    {(isWhatsApp ? t.bodyTextTemplate : (t.bodyHtmlTemplate || t.bodyTextTemplate)).length > 200 && "..."}
                  </p>
                </div>

                {/* Stats */}
                {(t.usageCount > 0 || t.avgOpenRate !== null) && (
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      {isWhatsApp ? (
                        <MessageCircle className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                      ) : (
                        <Mail className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                      )}
                      <span className="text-[10px] font-mono text-text-secondary">
                        {t.usageCount} usos
                      </span>
                    </div>
                    {t.avgOpenRate !== null && !isWhatsApp && (
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                        <span className="text-[10px] font-mono text-text-secondary">
                          {(t.avgOpenRate * 100).toFixed(1)}% apertura
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Variables */}
                {vars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {vars.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-[9px] font-mono uppercase tracking-[0.06em] text-text-muted"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                    <Edit className="h-3 w-3" strokeWidth={1.5} /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      copyToClipboard(
                        isWhatsApp ? t.bodyTextTemplate : t.bodyTextTemplate
                      )
                    }
                  >
                    <Copy className="h-3 w-3" strokeWidth={1.5} /> Copiar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-3 w-3 text-accent" strokeWidth={1.5} /> Eliminar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Editar template" : "Nuevo template"}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="nd-label block mb-2">Nombre</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del template"
              />
            </div>
            <div className="w-40">
              <label className="nd-label block mb-2">Canal</label>
              <Select
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value as "email" | "whatsapp" })
                }
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="nd-label block mb-2">Categoria (opcional)</label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="restaurantes, clinicas, general..."
            />
          </div>

          {form.channel === "email" ? (
            <>
              <div>
                <label className="nd-label block mb-2">Asunto</label>
                <Input
                  value={form.subjectTemplate}
                  onChange={(e) =>
                    setForm({ ...form, subjectTemplate: e.target.value })
                  }
                  placeholder="Asunto del email con {{variables}}"
                />
              </div>
              <div>
                <label className="nd-label block mb-2">Body HTML</label>
                <Textarea
                  rows={10}
                  value={form.bodyHtmlTemplate}
                  onChange={(e) =>
                    setForm({ ...form, bodyHtmlTemplate: e.target.value })
                  }
                  placeholder="<p>Hola {{business_name}},</p>..."
                />
              </div>
              <div>
                <label className="nd-label block mb-2">Body texto plano</label>
                <Textarea
                  rows={5}
                  value={form.bodyTextTemplate}
                  onChange={(e) =>
                    setForm({ ...form, bodyTextTemplate: e.target.value })
                  }
                  placeholder="Version texto plano del email..."
                />
              </div>
            </>
          ) : (
            <div>
              <label className="nd-label block mb-2">Mensaje WhatsApp</label>
              <Textarea
                rows={8}
                value={form.bodyTextTemplate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bodyTextTemplate: e.target.value,
                    bodyHtmlTemplate: e.target.value,
                    subjectTemplate: "-",
                  })
                }
                placeholder="Hola {{business_name}}, vi que..."
                maxLength={500}
              />
              <p className="text-[10px] text-text-muted font-mono mt-1">
                {form.bodyTextTemplate.length}/500 caracteres
              </p>
            </div>
          )}

          <div>
            <label className="nd-label block mb-2">
              Variables (separadas por coma)
            </label>
            <Input
              value={form.variables}
              onChange={(e) =>
                setForm({ ...form, variables: e.target.value })
              }
              placeholder="business_name, city, issue"
            />
            <p className="text-[10px] text-text-muted font-mono mt-2 leading-relaxed">
              Usa {"{{variable}}"} para campos dinamicos: {"{{business_name}}"},{" "}
              {"{{city}}"}, {"{{issue}}"}
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={
                !form.name ||
                (form.channel === "email" ? !form.subjectTemplate : !form.bodyTextTemplate) ||
                saving
              }
            >
              {saving
                ? "[GUARDANDO...]"
                : editing
                  ? "Guardar cambios"
                  : "Crear template"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* AI Generation Modal */}
      <Modal
        open={showAiModal}
        onClose={() => {
          setShowAiModal(false);
          setAiResult(null);
        }}
        title="Generar template con IA"
        maxWidth="max-w-3xl"
      >
        {!aiResult ? (
          <div className="space-y-5">
            {/* Channel selector */}
            <div>
              <label className="nd-label block mb-3">Canal</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAiForm({ ...aiForm, channel: "email" })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-[11px] font-mono uppercase tracking-[0.06em] transition-all cursor-pointer ${
                    aiForm.channel === "email"
                      ? "border-accent text-accent bg-accent-subtle"
                      : "border-border text-text-muted hover:border-border-light"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Email
                </button>
                <button
                  onClick={() => setAiForm({ ...aiForm, channel: "whatsapp" })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-[11px] font-mono uppercase tracking-[0.06em] transition-all cursor-pointer ${
                    aiForm.channel === "whatsapp"
                      ? "border-accent text-accent bg-accent-subtle"
                      : "border-border text-text-muted hover:border-border-light"
                  }`}
                >
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                  WhatsApp
                </button>
              </div>
            </div>

            {/* Industry */}
            <div>
              <label className="nd-label block mb-2">Industria / sector</label>
              <Select
                value={aiForm.industry}
                onChange={(e) =>
                  setAiForm({ ...aiForm, industry: e.target.value })
                }
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </Select>
              {aiForm.industry === "Otro" && (
                <Input
                  className="mt-2"
                  value={aiForm.customIndustry}
                  onChange={(e) =>
                    setAiForm({ ...aiForm, customIndustry: e.target.value })
                  }
                  placeholder="Especifica la industria..."
                />
              )}
            </div>

            {/* Purpose */}
            <div>
              <label className="nd-label block mb-3">Tipo de mensaje</label>
              <div className="flex gap-2 flex-wrap">
                {PURPOSES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() =>
                      setAiForm({ ...aiForm, purpose: p.value as typeof aiForm.purpose })
                    }
                    className={`px-4 py-2 rounded-full border text-[11px] font-mono uppercase tracking-[0.06em] transition-all cursor-pointer ${
                      aiForm.purpose === p.value
                        ? "border-accent text-accent bg-accent-subtle"
                        : "border-border text-text-muted hover:border-border-light"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div>
              <label className="nd-label block mb-2">Tono</label>
              <Select
                value={aiForm.tone}
                onChange={(e) =>
                  setAiForm({ ...aiForm, tone: e.target.value })
                }
              >
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Custom instructions */}
            <div>
              <label className="nd-label block mb-2">
                Instrucciones adicionales (opcional)
              </label>
              <Textarea
                rows={3}
                value={aiForm.customInstructions}
                onChange={(e) =>
                  setAiForm({ ...aiForm, customInstructions: e.target.value })
                }
                placeholder="Ej: Enfocate en el servicio de SEO, menciona que hacemos auditorias gratuitas..."
              />
            </div>

            {/* Best practices info */}
            <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-3">
              <p className="text-[10px] text-text-muted font-mono leading-relaxed">
                {aiForm.channel === "email" ? (
                  <>
                    La IA generara un email de 75-125 palabras en texto plano,
                    sin palabras spam, con un CTA suave y personalizable con
                    variables. Optimizado para deliverability y cumplimiento
                    RGPD/LSSI.
                  </>
                ) : (
                  <>
                    La IA generara un mensaje de WhatsApp de max 500
                    caracteres, conversacional y natural, sin formato HTML,
                    optimizado para evitar bloqueos y reportes.
                  </>
                )}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAiModal(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={generate}
                disabled={
                  generating ||
                  (aiForm.industry === "Otro" && !aiForm.customIndustry)
                }
              >
                {generating ? (
                  <>
                    <span className="inline-flex gap-[3px]">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1 h-1 bg-current animate-pulse"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </span>
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Generar template
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* AI Result preview */
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] text-text-display font-mono uppercase tracking-[0.06em]">
                {aiResult.channel === "email" ? "Email" : "WhatsApp"} generado
              </h3>
              <Badge color="success">IA</Badge>
            </div>

            {/* Name */}
            <div>
              <label className="nd-label block mb-2">Nombre</label>
              <Input
                value={aiResult.name}
                onChange={(e) =>
                  setAiResult({ ...aiResult, name: e.target.value })
                }
              />
            </div>

            {aiResult.channel === "email" ? (
              <>
                {/* Subject */}
                <div>
                  <label className="nd-label block mb-2">Asunto</label>
                  <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-3">
                    <p className="text-sm text-text-primary font-mono">
                      {aiResult.subject}
                    </p>
                  </div>
                </div>

                {/* Body preview */}
                <div>
                  <label className="nd-label block mb-2">Cuerpo del email</label>
                  <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-4">
                    <div
                      className="text-sm text-text-primary leading-relaxed prose-sm"
                      dangerouslySetInnerHTML={{
                        __html: aiResult.bodyHtml || "",
                      }}
                    />
                  </div>
                </div>

                {/* Text version */}
                <div>
                  <label className="nd-label block mb-2">Texto plano</label>
                  <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-3">
                    <p className="text-[12px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                      {aiResult.bodyText}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              /* WhatsApp preview */
              <div>
                <label className="nd-label block mb-2">Mensaje</label>
                <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-4">
                  <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {aiResult.message}
                  </p>
                </div>
                <p className="text-[10px] text-text-muted font-mono mt-1">
                  {(aiResult.message || "").length}/500 caracteres
                </p>
              </div>
            )}

            {/* Variables */}
            {aiResult.variables.length > 0 && (
              <div>
                <label className="nd-label block mb-2">Variables detectadas</label>
                <div className="flex flex-wrap gap-1.5">
                  {aiResult.variables.map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center px-2.5 py-1 rounded-full border border-border text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAiResult(null)}
              >
                Regenerar
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(
                      aiResult.channel === "email"
                        ? aiResult.bodyText || ""
                        : aiResult.message || ""
                    )
                  }
                >
                  <Copy className="h-3 w-3" strokeWidth={1.5} /> Copiar
                </Button>
                <Button
                  size="sm"
                  onClick={saveAiResult}
                  disabled={savingAi}
                >
                  {savingAi ? "[GUARDANDO...]" : "Guardar template"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
