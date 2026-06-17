"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, Select, Textarea, Toggle, Modal, Badge, EmptyState, Spinner, ConfirmDialog, ValueChip } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { Building, Plus, Edit, Trash2, Star, X } from "lucide-react";

const SERVICE_KEYS = ["web_development", "seo", "ai_agents", "google_business", "social_media"] as const;
const COUNTRY_CODES = ["ES", "MX", "AR", "CO", "CL", "PE", "EC", "UY", "US", "UK", "CA", "AU", "BR", "PT", "FR", "DE", "IT", "NL"] as const;
const STRATEGIES = ["web_design", "seo_visibility"] as const;

interface CaseStudy { client: string; result: string; snippet?: string }

interface Profile {
  id: number;
  label: string | null;
  strategy: "web_design" | "seo_visibility";
  isDefault: boolean;
  name: string | null;
  url: string | null;
  description: string | null;
  tagline: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  services: string[];
  city: string | null;
  country: string | null;
  valueProps: string[];
  caseStudies: CaseStudy[];
}

interface FormState {
  label: string;
  strategy: "web_design" | "seo_visibility";
  name: string;
  url: string;
  tagline: string;
  description: string;
  services: string[];
  valueProps: string[];
  caseStudies: CaseStudy[];
  ownerName: string;
  ownerRole: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  country: string;
}

const emptyForm: FormState = {
  label: "",
  strategy: "web_design",
  name: "",
  url: "",
  tagline: "",
  description: "",
  services: [],
  valueProps: [],
  caseStudies: [],
  ownerName: "",
  ownerRole: "",
  contactEmail: "",
  contactPhone: "",
  city: "",
  country: "ES",
};

export function AgencyProfilesManager() {
  const { t } = useT();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);

  const fetchProfiles = useCallback(async () => {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    setProfiles(data.profiles ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    setForm({
      label: p.label || "",
      strategy: p.strategy,
      name: p.name || "",
      url: p.url || "",
      tagline: p.tagline || "",
      description: p.description || "",
      services: p.services || [],
      valueProps: p.valueProps || [],
      caseStudies: p.caseStudies || [],
      ownerName: p.ownerName || "",
      ownerRole: p.ownerRole || "",
      contactEmail: p.contactEmail || "",
      contactPhone: p.contactPhone || "",
      city: p.city || "",
      country: p.country || "ES",
    });
    setShowModal(true);
  };

  const toggleService = (key: string) => {
    setForm((f) => ({
      ...f,
      services: f.services.includes(key) ? f.services.filter((s) => s !== key) : [...f.services, key],
    }));
  };

  const save = async () => {
    setSaving(true);
    // Drop empty value props / case studies before sending
    const payload = {
      ...form,
      valueProps: form.valueProps.map((v) => v.trim()).filter(Boolean),
      caseStudies: form.caseStudies.filter((c) => c.client.trim() || c.result.trim()),
    };
    const res = editing
      ? await fetch("/api/profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      : await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.error || t("profiles.saveError"), "error");
      return;
    }
    setShowModal(false);
    toast(editing ? t("profiles.updated") : t("profiles.created"), "success");
    fetchProfiles();
  };

  const setDefault = async (p: Profile) => {
    await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, isDefault: true }),
    });
    toast(t("profiles.defaultSet"), "success");
    fetchProfiles();
  };

  const remove = async (p: Profile) => {
    const res = await fetch(`/api/profiles?id=${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.error || t("profiles.deleteError"), "error");
      return;
    }
    toast(t("profiles.deleted"), "success");
    fetchProfiles();
  };

  // ─── Value props editor helpers ───
  const addValueProp = () => setForm((f) => ({ ...f, valueProps: [...f.valueProps, ""] }));
  const updateValueProp = (i: number, v: string) =>
    setForm((f) => ({ ...f, valueProps: f.valueProps.map((p, idx) => (idx === i ? v : p)) }));
  const removeValueProp = (i: number) =>
    setForm((f) => ({ ...f, valueProps: f.valueProps.filter((_, idx) => idx !== i) }));

  // ─── Case studies editor helpers ───
  const addCaseStudy = () => setForm((f) => ({ ...f, caseStudies: [...f.caseStudies, { client: "", result: "", snippet: "" }] }));
  const updateCaseStudy = (i: number, patch: Partial<CaseStudy>) =>
    setForm((f) => ({ ...f, caseStudies: f.caseStudies.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const removeCaseStudy = (i: number) =>
    setForm((f) => ({ ...f, caseStudies: f.caseStudies.filter((_, idx) => idx !== i) }));

  const angleLabel = (s: string) => (s === "seo_visibility" ? t("profiles.angleSeo") : t("profiles.angleWeb"));

  return (
    <div id="agency" className="nd-section">
      <Card className="col-span-12">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="nd-heading">
              <Building className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
              {t("profiles.title")}
            </h3>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">{t("profiles.subtitle")}</p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("profiles.newProfile")}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : profiles.length === 0 ? (
          <EmptyState
            icon={<Building className="h-8 w-8" strokeWidth={1.5} />}
            title={t("profiles.empty")}
            description={t("profiles.emptyDesc")}
            action={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("profiles.newProfile")}</Button>}
          />
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <div key={p.id} className="nd-card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-text-display font-medium">{p.label || p.name || `#${p.id}`}</span>
                    {p.isDefault && <Badge color="success"><Star className="h-2.5 w-2.5 inline mr-1" strokeWidth={2} />{t("profiles.default")}</Badge>}
                    <Badge color={p.strategy === "seo_visibility" ? "info" : "default"}>{angleLabel(p.strategy)}</Badge>
                  </div>
                  {p.name && p.label && p.name !== p.label && (
                    <p className="text-[11px] text-text-muted mt-1">{p.name}</p>
                  )}
                  {p.tagline && <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{p.tagline}</p>}
                  {p.services.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.services.map((s) => (
                        <ValueChip key={s}>{t(`services.${s}`)}</ValueChip>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!p.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setDefault(p)} title={t("profiles.makeDefault")}>
                      <Star className="h-3 w-3" strokeWidth={1.5} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                    <Edit className="h-3 w-3" strokeWidth={1.5} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)} disabled={p.isDefault}>
                    <Trash2 className="h-3 w-3 text-accent" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Editor */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("profiles.editProfile") : t("profiles.newProfile")} maxWidth="max-w-2xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="nd-label block mb-2">{t("profiles.labelField")}</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t("profiles.labelPlaceholder")} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.angle")}</label>
              <Select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value as FormState["strategy"] })}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{angleLabel(s)}</option>)}
              </Select>
            </div>
            <div>
              <label className="nd-label block mb-2">{t("settings.agencyName")}</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("settings.agencyUrl")}</label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="vanguardia.dev" />
            </div>
            <div className="md:col-span-2">
              <label className="nd-label block mb-2">{t("profiles.tagline")}</label>
              <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder={t("profiles.taglinePlaceholder")} />
            </div>
            <div className="md:col-span-2">
              <label className="nd-label block mb-2">{t("common.description")}</label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder={t("settings.descriptionPlaceholder")} />
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="nd-label block mb-3">{t("settings.servicesOffered")}</label>
            <div className="flex flex-wrap gap-2">
              {SERVICE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleService(key)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[11px] font-mono uppercase tracking-[0.04em] transition-all cursor-pointer ${
                    form.services.includes(key)
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-border text-text-muted hover:border-border-light hover:text-text-secondary"
                  }`}
                >
                  {t(`services.${key}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Value props */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="nd-label">{t("profiles.valueProps")}</label>
              <Button size="sm" variant="ghost" onClick={addValueProp}><Plus className="h-3 w-3" strokeWidth={1.5} /> {t("profiles.add")}</Button>
            </div>
            <div className="space-y-2">
              {form.valueProps.map((vp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={vp} onChange={(e) => updateValueProp(i, e.target.value)} placeholder={t("profiles.valuePropPlaceholder")} />
                  <button type="button" onClick={() => removeValueProp(i)} className="text-text-muted hover:text-accent flex-shrink-0">
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              {form.valueProps.length === 0 && <p className="text-[11px] text-text-muted">{t("profiles.noValueProps")}</p>}
            </div>
          </div>

          {/* Case studies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="nd-label">{t("profiles.caseStudies")}</label>
              <Button size="sm" variant="ghost" onClick={addCaseStudy}><Plus className="h-3 w-3" strokeWidth={1.5} /> {t("profiles.add")}</Button>
            </div>
            <div className="space-y-3">
              {form.caseStudies.map((cs, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted font-mono">#{i + 1}</span>
                    <button type="button" onClick={() => removeCaseStudy(i)} className="text-text-muted hover:text-accent">
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input value={cs.client} onChange={(e) => updateCaseStudy(i, { client: e.target.value })} placeholder={t("profiles.caseClient")} />
                    <Input value={cs.result} onChange={(e) => updateCaseStudy(i, { result: e.target.value })} placeholder={t("profiles.caseResult")} />
                  </div>
                  <Input value={cs.snippet || ""} onChange={(e) => updateCaseStudy(i, { snippet: e.target.value })} placeholder={t("profiles.caseSnippet")} />
                </div>
              ))}
              {form.caseStudies.length === 0 && <p className="text-[11px] text-text-muted">{t("profiles.noCaseStudies")}</p>}
            </div>
          </div>

          {/* Owner + contact + location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="nd-label block mb-2">{t("profiles.ownerName")}</label>
              <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.ownerRole")}</label>
              <Input value={form.ownerRole} onChange={(e) => setForm({ ...form, ownerRole: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.contactEmail")}</label>
              <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.contactPhone")}</label>
              <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.city")}</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">{t("profiles.country")}</label>
              <Select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={save} disabled={saving || !form.label.trim()}>
              {saving ? t("common.saving") : editing ? t("common.save") : t("profiles.create")}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        title={t("profiles.deleteProfile")}
        message={t("profiles.deleteConfirm").replace("{{name}}", confirmDelete?.label || confirmDelete?.name || "")}
        confirmLabel={t("common.delete")}
        variant="danger"
      />
    </div>
  );
}
