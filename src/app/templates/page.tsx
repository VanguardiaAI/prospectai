"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Badge, Modal, Input, Textarea, EmptyState, Spinner } from "@/components/ui";
import { FileText, Plus, Edit, Trash2, Mail, Eye } from "lucide-react";

interface Template {
  id: number;
  name: string;
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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    subjectTemplate: "",
    bodyHtmlTemplate: "",
    bodyTextTemplate: "",
    variables: "",
  });

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
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
            {templates.length} template{templates.length !== 1 ? "s" : ""} de
            email
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Nuevo template
        </Button>
      </div>

      {/* Templates grid */}
      {templates.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" strokeWidth={1.5} />}
          title="Sin templates"
          description="Crea tu primer template de email para reutilizar en tus campanas"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t) => {
            const vars = parseVariables(t.variables);
            const bodyPreview = stripHtml(t.bodyHtmlTemplate || t.bodyTextTemplate).slice(0, 200);

            return (
              <Card key={t.id} className="flex flex-col">
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0">
                    <h3 className="text-[15px] text-text-display font-medium truncate">
                      {t.name}
                    </h3>
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

                {/* Subject preview */}
                <div className="mb-3">
                  <span className="nd-label block mb-1">Asunto</span>
                  <p className="text-[12px] text-text-primary font-mono truncate">
                    {t.subjectTemplate}
                  </p>
                </div>

                {/* Body preview */}
                <div className="flex-1 mb-4">
                  <span className="nd-label block mb-1">Preview</span>
                  <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-4">
                    {bodyPreview}
                    {(t.bodyHtmlTemplate || t.bodyTextTemplate).length > 200 && "..."}
                  </p>
                </div>

                {/* Stats */}
                {(t.usageCount > 0 || t.avgOpenRate !== null) && (
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                      <span className="text-[10px] font-mono text-text-secondary">
                        {t.usageCount} usos
                      </span>
                    </div>
                    {t.avgOpenRate !== null && (
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
          <div>
            <label className="nd-label block mb-2">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre del template"
            />
          </div>
          <div>
            <label className="nd-label block mb-2">Categoria (opcional)</label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="restaurantes, clinicas, general..."
            />
          </div>
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
              disabled={!form.name || !form.subjectTemplate || saving}
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
    </div>
  );
}
