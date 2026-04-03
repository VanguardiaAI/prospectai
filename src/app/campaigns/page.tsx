"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, Select, Toggle, Modal, StatusBadge, Badge, EmptyState, Spinner } from "@/components/ui";
import { Megaphone, Plus, Edit, Trash2, ListOrdered, ArrowDown } from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  description: string | null;
  dailyLimit: number;
  qualityThreshold: number;
  autopilot: boolean;
  defaultTone: string;
  status: string;
  createdAt: string;
}

interface SequenceStep {
  channel: "email" | "whatsapp";
  delayDays: number;
  tone: string;
  customInstructions: string;
  enabled: boolean;
}

interface SequenceData {
  steps: { id: number; stepNumber: number; channel: string; delayDays: number; tone: string; customInstructions: string | null; enabled: boolean }[];
  enrollments: { id: number; leadId: number; currentStep: number; status: string; nextActionAt: string | null }[];
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    dailyLimit: 20,
    qualityThreshold: 40,
    autopilot: false,
    defaultTone: "profesional",
  });

  // Sequence state
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [sequenceCampaign, setSequenceCampaign] = useState<Campaign | null>(null);
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([]);
  const [sequenceData, setSequenceData] = useState<Record<number, SequenceData>>({});
  const [savingSequence, setSavingSequence] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data);
    setLoading(false);

    // Fetch sequence data for all campaigns
    for (const c of data) {
      fetch(`/api/sequences?campaignId=${c.id}`).then((r) => r.json()).then((sd) => {
        setSequenceData((prev) => ({ ...prev, [c.id]: sd }));
      });
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", dailyLimit: 20, qualityThreshold: 40, autopilot: false, defaultTone: "profesional" });
    setShowModal(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description || "",
      dailyLimit: c.dailyLimit,
      qualityThreshold: c.qualityThreshold,
      autopilot: c.autopilot,
      defaultTone: c.defaultTone,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (editing) {
      await fetch("/api/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
    } else {
      await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setShowModal(false);
    fetchCampaigns();
  };

  const remove = async (id: number) => {
    if (!confirm("Eliminar esta campana?")) return;
    await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    fetchCampaigns();
  };

  const toggleAutopilot = async (c: Campaign) => {
    await fetch("/api/campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, autopilot: !c.autopilot }),
    });
    fetchCampaigns();
  };

  const toggleStatus = async (c: Campaign) => {
    const next = c.status === "active" ? "paused" : "active";
    await fetch("/api/campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status: next }),
    });
    fetchCampaigns();
  };

  // Sequence management
  const openSequence = (c: Campaign) => {
    setSequenceCampaign(c);
    const existing = sequenceData[c.id]?.steps || [];
    if (existing.length > 0) {
      setSequenceSteps(existing.map((s) => ({
        channel: s.channel as "email" | "whatsapp",
        delayDays: s.delayDays,
        tone: s.tone,
        customInstructions: s.customInstructions || "",
        enabled: s.enabled,
      })));
    } else {
      // Default sequence: email day 0, follow-up email day 3, WhatsApp day 7
      setSequenceSteps([
        { channel: "email", delayDays: 0, tone: c.defaultTone, customInstructions: "", enabled: true },
        { channel: "email", delayDays: 3, tone: c.defaultTone, customInstructions: "Este es un follow-up. Cambia el angulo.", enabled: true },
        { channel: "whatsapp", delayDays: 4, tone: "amigable", customInstructions: "", enabled: true },
      ]);
    }
    setShowSequenceModal(true);
  };

  const addStep = () => {
    setSequenceSteps([...sequenceSteps, { channel: "email", delayDays: 3, tone: "profesional", customInstructions: "", enabled: true }]);
  };

  const removeStep = (idx: number) => {
    setSequenceSteps(sequenceSteps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    setSequenceSteps(sequenceSteps.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const saveSequence = async () => {
    if (!sequenceCampaign) return;
    setSavingSequence(true);
    await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_steps",
        campaignId: sequenceCampaign.id,
        steps: sequenceSteps,
      }),
    });
    setSavingSequence(false);
    setShowSequenceModal(false);
    fetchCampaigns();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>Campanas</h1>
          <p className="nd-label mt-2">Agrupa tus leads y configura cada campana</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Nueva campana
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" strokeWidth={1.5} />}
          title="Sin campanas"
          description="Crea tu primera campana para empezar a organizar tus leads"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const sd = sequenceData[c.id];
            const stepCount = sd?.steps?.length || 0;
            const activeEnrollments = sd?.enrollments?.filter((e) => e.status === "active").length || 0;

            return (
              <Card key={c.id} className="flex flex-col">
                {/* Card header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-[15px] text-text-display font-medium">{c.name}</h3>
                    {c.description && <p className="text-[11px] text-text-muted mt-1 leading-relaxed">{c.description}</p>}
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                {/* Key-value list */}
                <div className="flex-1 space-y-0">
                  <div className="nd-list-item pt-0">
                    <span className="nd-list-label">Limite diario</span>
                    <span className="nd-list-value">{c.dailyLimit}</span>
                  </div>
                  <div className="nd-list-item">
                    <span className="nd-list-label">Umbral calidad</span>
                    <span className="nd-list-value">{c.qualityThreshold}</span>
                  </div>
                  <div className="nd-list-item">
                    <span className="nd-list-label">Tono</span>
                    <span className="text-[11px] text-text-primary font-mono uppercase">{c.defaultTone}</span>
                  </div>
                  <div className="nd-list-item">
                    <span className="nd-list-label">Autopilot</span>
                    <Toggle checked={c.autopilot} onChange={() => toggleAutopilot(c)} />
                  </div>
                  <div className="nd-list-item">
                    <span className="nd-list-label">Secuencia</span>
                    <div className="flex items-center gap-2">
                      {stepCount > 0 ? (
                        <Badge color="info">{stepCount} pasos</Badge>
                      ) : (
                        <Badge>Sin configurar</Badge>
                      )}
                      {activeEnrollments > 0 && (
                        <Badge color="success">{activeEnrollments} activos</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus(c)}>
                    {c.status === "active" ? "Pausar" : "Activar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openSequence(c)} title="Configurar secuencia">
                    <ListOrdered className="h-3 w-3" strokeWidth={1.5} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Edit className="h-3 w-3" strokeWidth={1.5} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-3 w-3 text-accent" strokeWidth={1.5} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Editar campana" : "Nueva campana"}>
        <div className="space-y-5">
          <div>
            <label className="nd-label block mb-2">Nombre</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la campana" />
          </div>
          <div>
            <label className="nd-label block mb-2">Descripcion</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripcion opcional" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="nd-label block mb-2">Limite diario</label>
              <Input type="number" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
            </div>
            <div>
              <label className="nd-label block mb-2">Umbral calidad</label>
              <Input type="number" value={form.qualityThreshold} onChange={(e) => setForm({ ...form, qualityThreshold: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="nd-label block mb-2">Tono por defecto</label>
            <Select value={form.defaultTone} onChange={(e) => setForm({ ...form, defaultTone: e.target.value })}>
              <option value="profesional">Profesional</option>
              <option value="amigable">Amigable</option>
              <option value="directo">Directo</option>
              <option value="consultivo">Consultivo</option>
              <option value="casual">Casual</option>
            </Select>
          </div>
          <div>
            <Toggle checked={form.autopilot} onChange={(v) => setForm({ ...form, autopilot: v })} label="Autopilot" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={!form.name}>{editing ? "Guardar" : "Crear"}</Button>
          </div>
        </div>
      </Modal>

      {/* Sequence Builder Modal */}
      <Modal open={showSequenceModal} onClose={() => setShowSequenceModal(false)} title={`Secuencia: ${sequenceCampaign?.name || ""}`}>
        <div className="space-y-4">
          <p className="text-[11px] text-text-muted leading-relaxed">
            Define los pasos de seguimiento. Cada paso se ejecuta automaticamente despues del delay configurado. La IA genera contenido diferente para cada paso.
          </p>

          {sequenceSteps.map((step, idx) => (
            <div key={idx}>
              <div className={`border border-border rounded-lg p-4 ${!step.enabled ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge color={step.channel === "email" ? "info" : "success"}>
                      {idx + 1}. {step.channel === "email" ? "Email" : "WhatsApp"}
                    </Badge>
                    {idx === 0 ? (
                      <span className="text-[10px] text-text-muted">Primer contacto</span>
                    ) : (
                      <span className="text-[10px] text-text-muted">+{step.delayDays} dias</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={step.enabled} onChange={(v) => updateStep(idx, { enabled: v })} />
                    {sequenceSteps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-accent hover:text-text-primary">
                        <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1">Canal</label>
                    <Select value={step.channel} onChange={(e) => updateStep(idx, { channel: e.target.value as "email" | "whatsapp" })}>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1">Delay (dias)</label>
                    <Input type="number" value={step.delayDays} onChange={(e) => updateStep(idx, { delayDays: Number(e.target.value) })} min={0} />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1">Tono</label>
                    <Select value={step.tone} onChange={(e) => updateStep(idx, { tone: e.target.value })}>
                      <option value="profesional">Profesional</option>
                      <option value="amigable">Amigable</option>
                      <option value="directo">Directo</option>
                      <option value="consultivo">Consultivo</option>
                      <option value="casual">Casual</option>
                    </Select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-[10px] text-text-muted block mb-1">Instrucciones adicionales para IA (opcional)</label>
                  <Input
                    value={step.customInstructions}
                    onChange={(e) => updateStep(idx, { customInstructions: e.target.value })}
                    placeholder="Ej: Enfocate en SEO, menciona caso de exito..."
                  />
                </div>
              </div>
              {idx < sequenceSteps.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
                </div>
              )}
            </div>
          ))}

          <Button variant="secondary" size="sm" onClick={addStep} className="w-full">
            <Plus className="h-3 w-3" strokeWidth={1.5} /> Agregar paso
          </Button>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowSequenceModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveSequence} disabled={savingSequence || sequenceSteps.length === 0}>
              {savingSequence ? "Guardando..." : "Guardar secuencia"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
