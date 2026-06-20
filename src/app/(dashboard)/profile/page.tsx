"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, Textarea, Toggle, Badge, EmptyState, Spinner } from "@/components/ui";
import { FolderKanban, Plus, Star, Trash2, Sparkles, Globe, Pencil } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";

interface Project {
  id: number;
  title: string;
  client: string | null;
  sector: string | null;
  description: string | null;
  problem: string | null;
  solution: string | null;
  services: string[];
  stack: string[];
  deliverables: string | null;
  result: string | null;
  metric: string | null;
  testimonial: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  durationLabel: string | null;
  tags: string[];
  notes: string | null;
  highlight: boolean;
  source: string | null;
}

interface Extracted {
  title: string;
  client: string | null;
  sector: string | null;
  description: string | null;
  problem: string | null;
  solution: string | null;
  services: string[];
  stack: string[];
  result: string | null;
  metric: string | null;
  testimonial: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  tags: string[];
  duplicate?: boolean;
}

interface EnrichItem {
  id: number;
  projectId: number | null;
  question: string;
  answer: string | null;
  category: string;
  priority: number;
  status: string;
}

const csv = (a: string[] | undefined) => (a || []).join(", ");
const parseCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const orNull = (s: string) => (s.trim() ? s.trim() : null);

type Draft = Partial<Project> & { title: string };

function blankDraft(): Draft {
  return {
    title: "", client: "", sector: "", description: "", problem: "", solution: "", deliverables: "",
    result: "", metric: "", testimonial: "", testimonialAuthor: "", projectUrl: "",
    durationLabel: "", notes: "", services: [], stack: [], tags: [], highlight: false,
  };
}

/** Inline create/edit form, reused for new projects and editing existing ones. */
function ProjectEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Project | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [d, setD] = useState<Draft>(initial ? { ...initial } : blankDraft());
  const [servicesStr, setServicesStr] = useState(csv(initial?.services));
  const [stackStr, setStackStr] = useState(csv(initial?.stack));
  const [tagsStr, setTagsStr] = useState(csv(initial?.tags));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft, v: unknown) => setD((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!d.title.trim()) return;
    setBusy(true);
    const payload = {
      title: d.title.trim(),
      client: orNull(d.client || ""),
      sector: orNull(d.sector || ""),
      description: orNull(d.description || ""),
      problem: orNull(d.problem || ""),
      solution: orNull(d.solution || ""),
      deliverables: orNull(d.deliverables || ""),
      result: orNull(d.result || ""),
      metric: orNull(d.metric || ""),
      testimonial: orNull(d.testimonial || ""),
      testimonialAuthor: orNull(d.testimonialAuthor || ""),
      projectUrl: orNull(d.projectUrl || ""),
      durationLabel: orNull(d.durationLabel || ""),
      notes: orNull(d.notes || ""),
      services: parseCsv(servicesStr),
      stack: parseCsv(stackStr),
      tags: parseCsv(tagsStr),
      highlight: !!d.highlight,
    };
    if (initial) {
      await fetch("/api/portfolio/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: initial.id, ...payload }),
      });
    } else {
      await fetch("/api/portfolio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "manual" }),
      });
    }
    setBusy(false);
    onSaved();
  };

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 nd-enter space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="nd-label block mb-1">{t("profile.fTitle")}</label>
          <Input value={d.title} onChange={(e) => set("title", e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fClient")}</label>
          <Input value={d.client || ""} onChange={(e) => set("client", e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fSector")}</label>
          <Input value={d.sector || ""} onChange={(e) => set("sector", e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fDuration")}</label>
          <Input value={d.durationLabel || ""} onChange={(e) => set("durationLabel", e.target.value)} className="w-full" />
        </div>
      </div>

      <div>
        <label className="nd-label block mb-1">{t("profile.fDescription")}</label>
        <Textarea value={d.description || ""} onChange={(e) => set("description", e.target.value)} rows={3} className="w-full" />
      </div>
      <div>
        <label className="nd-label block mb-1">{t("profile.fProblem")}</label>
        <Textarea value={d.problem || ""} onChange={(e) => set("problem", e.target.value)} rows={2} className="w-full" />
      </div>
      <div>
        <label className="nd-label block mb-1">{t("profile.fSolution")}</label>
        <Textarea value={d.solution || ""} onChange={(e) => set("solution", e.target.value)} rows={2} className="w-full" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="nd-label block mb-1">{t("profile.fResult")}</label>
          <Input value={d.result || ""} onChange={(e) => set("result", e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fMetric")}</label>
          <Input value={d.metric || ""} onChange={(e) => set("metric", e.target.value)} className="w-full" placeholder="3x, +40%…" />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="nd-label block mb-1">{t("profile.fServices")}</label>
          <Input value={servicesStr} onChange={(e) => setServicesStr(e.target.value)} className="w-full" placeholder="web, seo" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fStack")}</label>
          <Input value={stackStr} onChange={(e) => setStackStr(e.target.value)} className="w-full" placeholder="Next.js, Stripe" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("profile.fTags")}</label>
          <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="w-full" placeholder="ecommerce, local" />
        </div>
      </div>

      <div>
        <label className="nd-label block mb-1">{t("profile.fDeliverables")}</label>
        <Input value={d.deliverables || ""} onChange={(e) => set("deliverables", e.target.value)} className="w-full" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="nd-label block mb-1">{t("profile.fTestimonial")}</label>
          <Textarea value={d.testimonial || ""} onChange={(e) => set("testimonial", e.target.value)} rows={2} className="w-full" />
        </div>
        <div className="space-y-3">
          <div>
            <label className="nd-label block mb-1">{t("profile.fTestimonialAuthor")}</label>
            <Input value={d.testimonialAuthor || ""} onChange={(e) => set("testimonialAuthor", e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="nd-label block mb-1">{t("profile.fUrl")}</label>
            <Input value={d.projectUrl || ""} onChange={(e) => set("projectUrl", e.target.value)} className="w-full" placeholder="https://" />
          </div>
        </div>
      </div>

      <div>
        <label className="nd-label block mb-1">{t("profile.fNotes")}</label>
        <Textarea value={d.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full" placeholder={t("profile.fNotesHint")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Toggle checked={!!d.highlight} onChange={(v) => set("highlight", v)} label={t("profile.fHighlight")} />
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>{t("profile.cancel")}</Button>
          <Button size="sm" onClick={save} disabled={busy || !d.title.trim()}>
            {busy ? t("profile.saving") : t("profile.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ p, onChanged }: { p: Project; onChanged: () => void }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!confirm(t("profile.confirmDelete"))) return;
    setBusy(true);
    await fetch(`/api/portfolio/projects?id=${p.id}`, { method: "DELETE" });
    setBusy(false);
    onChanged();
  };
  const toggleHighlight = async () => {
    setBusy(true);
    await fetch("/api/portfolio/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, highlight: !p.highlight }),
    });
    setBusy(false);
    onChanged();
  };

  if (editing) {
    return <ProjectEditor initial={p} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;
  }

  const resultLine = [p.result, p.metric].filter(Boolean).join(" · ");
  return (
    <div className="py-4 border-t border-border first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-medium text-text-display">{p.title}</span>
            {p.highlight && <Star className="h-3.5 w-3.5 text-accent fill-accent" />}
            {p.source && <Badge color="default">{p.source}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary font-mono">
            {p.client && <span>{p.client}</span>}
            {p.sector && <span>{p.sector}</span>}
            {p.stack.length > 0 && <span>{p.stack.join(", ")}</span>}
            {p.projectUrl && (
              <a href={p.projectUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {t("profile.viewProject")}
              </a>
            )}
          </div>
          {p.description && <p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{p.description}</p>}
          {resultLine && <p className="mt-1.5 text-sm text-text-primary leading-relaxed">{resultLine}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={toggleHighlight} disabled={busy} title={t("profile.fHighlight")} className="p-1.5 rounded text-text-muted hover:text-accent transition-colors">
            <Star className={p.highlight ? "h-4 w-4 fill-accent text-accent" : "h-4 w-4"} strokeWidth={1.5} />
          </button>
          <button onClick={() => setEditing(true)} disabled={busy} title={t("profile.edit")} className="p-1.5 rounded text-text-muted hover:text-text-primary transition-colors">
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button onClick={remove} disabled={busy} title={t("profile.delete")} className="p-1.5 rounded text-text-muted hover:text-coral transition-colors">
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewItem({ item, onChanged }: { item: EnrichItem; onChanged: () => void }) {
  const { t } = useT();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (action: "answer" | "skip") => {
    if (action === "answer" && !answer.trim()) return;
    setBusy(true);
    await fetch("/api/portfolio/enrichment", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action, answer }),
    });
    setBusy(false);
    onChanged();
  };

  return (
    <div className="py-4 border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 mb-2">
        <Badge color="default">{t(`profile.cat.${item.category}`)}</Badge>
        <span className="text-sm text-text-primary leading-relaxed">{item.question}</span>
      </div>
      <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} className="w-full" placeholder={t("profile.answerPlaceholder")} />
      <div className="flex items-center gap-3 mt-2">
        <Button size="sm" onClick={() => act("answer")} disabled={busy || !answer.trim()}>{t("profile.saveAnswer")}</Button>
        <Button size="sm" variant="ghost" onClick={() => act("skip")} disabled={busy}>{t("profile.skip")}</Button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pending, setPending] = useState<EnrichItem[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [adding, setAdding] = useState(false);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [extracted, setExtracted] = useState<Extracted[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState("");

  const loadProjects = useCallback(async () => {
    const r = await fetch("/api/portfolio/projects").then((x) => x.json()).catch(() => ({ projects: [] }));
    setProjects(Array.isArray(r?.projects) ? r.projects : []);
  }, []);
  const loadEnrichment = useCallback(async () => {
    const r = await fetch("/api/portfolio/enrichment").then((x) => x.json()).catch(() => ({ pending: [], answered: [] }));
    setPending(Array.isArray(r?.pending) ? r.pending : []);
    setAnsweredCount(Array.isArray(r?.answered) ? r.answered.length : 0);
  }, []);

  useEffect(() => {
    Promise.all([loadProjects(), loadEnrichment()]).finally(() => setLoading(false));
  }, [loadProjects, loadEnrichment]);

  const runImport = async () => {
    setImporting(true);
    setImportMsg("");
    setExtracted([]);
    const r = await fetch("/api/portfolio/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: importUrl.trim() || undefined }),
    }).then((x) => x.json()).catch(() => ({ error: "error" }));
    setImporting(false);
    if (r?.error) {
      setImportMsg(r.error === "no_url" ? t("profile.importNoUrl") : r.error);
      return;
    }
    const list: Extracted[] = Array.isArray(r?.projects) ? r.projects : [];
    setExtracted(list);
    // Pre-select only the new ones; duplicates start unchecked.
    setSelected(new Set(list.map((_, i) => i).filter((i) => !list[i].duplicate)));
    setImportMsg(t("profile.importFound").replace("{{n}}", String(list.length)).replace("{{p}}", String(r?.pagesScraped ?? 0)));
  };

  const saveSelected = async () => {
    const picks = extracted.filter((_, i) => selected.has(i)).map((e) => ({ ...e, source: "scraped" as const }));
    if (!picks.length) return;
    await fetch("/api/portfolio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects: picks }),
    });
    setExtracted([]);
    setSelected(new Set());
    setImportMsg("");
    loadProjects();
  };

  const generateQuestions = async () => {
    setEnrichBusy(true);
    setEnrichMsg("");
    const r = await fetch("/api/portfolio/enrichment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" }),
    }).then((x) => x.json()).catch(() => ({ error: "error" }));
    setEnrichBusy(false);
    if (r?.error) setEnrichMsg(r.error);
    else {
      setEnrichMsg(t("profile.enrichAdded").replace("{{n}}", String(r?.added ?? 0)));
      loadEnrichment();
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  return (
    <div data-surface="app" className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="nd-page-header">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <div>
            <h1 className="text-lg font-medium text-text-display">{t("profile.title")}</h1>
            <p className="text-xs text-text-muted mt-0.5">{t("profile.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Import from own site */}
      <Card title={t("profile.importTitle")}>
        <p className="text-xs text-text-muted mb-3 leading-relaxed">{t("profile.importHint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Globe className="h-4 w-4 text-text-muted flex-shrink-0" strokeWidth={1.5} />
            <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder={t("profile.importUrlPlaceholder")} className="w-full" />
          </div>
          <Button size="sm" onClick={runImport} disabled={importing}>
            {importing ? t("profile.importing") : t("profile.import")}
          </Button>
        </div>
        {importMsg && <p className="text-xs text-text-muted font-mono mt-3">{importMsg}</p>}

        {extracted.length > 0 && (
          <div className="mt-4 space-y-2">
            {extracted.map((e, i) => (
              <label key={i} className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-border-visible transition-colors">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={(ev) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(i); else next.delete(i);
                      return next;
                    });
                  }}
                  className="mt-1 accent-[var(--accent)]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{e.title}</span>
                    {e.duplicate && <Badge color="default">{t("profile.alreadyExists")}</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-muted font-mono">
                    {e.client && <span>{e.client}</span>}
                    {e.sector && <span>{e.sector}</span>}
                    {e.projectUrl && <span className="truncate">{e.projectUrl.replace(/^https?:\/\//, "")}</span>}
                  </div>
                  {e.description && <p className="mt-1 text-xs text-text-secondary leading-relaxed">{e.description}</p>}
                  {[e.result, e.metric].filter(Boolean).join(" · ") && (
                    <p className="mt-1 text-xs text-text-primary">{[e.result, e.metric].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              </label>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <Button size="sm" onClick={saveSelected} disabled={selected.size === 0}>
                {t("profile.saveSelected").replace("{{n}}", String(selected.size))}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setExtracted([]); setImportMsg(""); }}>
                {t("profile.discard")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Projects */}
      <Card title={t("profile.projectsTitle")} meta={String(projects.length)}>
        <div className="mb-3">
          {adding ? (
            <ProjectEditor initial={null} onSaved={() => { setAdding(false); loadProjects(); }} onCancel={() => setAdding(false)} />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" strokeWidth={2} /> {t("profile.addProject")}
            </Button>
          )}
        </div>
        {projects.length === 0 && !adding ? (
          <EmptyState icon={<FolderKanban className="h-7 w-7" strokeWidth={1.5} />} title={t("profile.noProjects")} description={t("profile.noProjectsHint")} />
        ) : (
          <div>{projects.map((p) => <ProjectCard key={p.id} p={p} onChanged={loadProjects} />)}</div>
        )}
      </Card>

      {/* AI interview */}
      <Card title={t("profile.interviewTitle")} meta={answeredCount > 0 ? t("profile.answeredCount").replace("{{n}}", String(answeredCount)) : undefined}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Button size="sm" onClick={generateQuestions} disabled={enrichBusy}>
            <Sparkles className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
            {enrichBusy ? t("profile.generating") : t("profile.generateQuestions")}
          </Button>
          {enrichMsg && <span className="text-xs text-text-muted font-mono">{enrichMsg}</span>}
        </div>
        <p className="text-xs text-text-muted mb-2 leading-relaxed">{t("profile.interviewHint")}</p>
        {pending.length === 0 ? (
          <EmptyState icon={<Sparkles className="h-7 w-7" strokeWidth={1.5} />} title={t("profile.noQuestions")} description={t("profile.noQuestionsHint")} />
        ) : (
          <div>{pending.map((q) => <InterviewItem key={q.id} item={q} onChanged={loadEnrichment} />)}</div>
        )}
      </Card>
    </div>
  );
}
