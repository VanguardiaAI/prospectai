import { db } from "@/db";
import { portfolioProjects, profileEnrichment } from "@/db/schema";
import { eq, desc, or, isNull, and } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

/** Editable fields for a portfolio project (arrays serialized as JSON). */
export interface PortfolioProjectData {
  agencyProfileId?: number | null;
  title: string;
  client?: string | null;
  sector?: string | null;
  description?: string | null;
  problem?: string | null;
  solution?: string | null;
  services?: string[];
  stack?: string[];
  deliverables?: string | null;
  result?: string | null;
  metric?: string | null;
  testimonial?: string | null;
  testimonialAuthor?: string | null;
  projectUrl?: string | null;
  durationLabel?: string | null;
  tags?: string[];
  notes?: string | null;
  highlight?: boolean;
  source?: "scraped" | "manual" | "enriched";
  sourceUrl?: string | null;
}

/** A portfolio project with JSON columns parsed back into arrays. */
export interface PortfolioProject {
  id: number;
  agencyProfileId: number | null;
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
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type ProjectRow = typeof portfolioProjects.$inferSelect;

function parseStrArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rowToProject(r: ProjectRow): PortfolioProject {
  return {
    id: r.id,
    agencyProfileId: r.agencyProfileId ?? null,
    title: r.title,
    client: r.client ?? null,
    sector: r.sector ?? null,
    description: r.description ?? null,
    problem: r.problem ?? null,
    solution: r.solution ?? null,
    services: parseStrArray(r.services),
    stack: parseStrArray(r.stack),
    deliverables: r.deliverables ?? null,
    result: r.result ?? null,
    metric: r.metric ?? null,
    testimonial: r.testimonial ?? null,
    testimonialAuthor: r.testimonialAuthor ?? null,
    projectUrl: r.projectUrl ?? null,
    durationLabel: r.durationLabel ?? null,
    tags: parseStrArray(r.tags),
    notes: r.notes ?? null,
    highlight: !!r.highlight,
    source: r.source ?? null,
    sourceUrl: r.sourceUrl ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function buildProjectValues(data: Partial<PortfolioProjectData>): Partial<typeof portfolioProjects.$inferInsert> {
  const v: Partial<typeof portfolioProjects.$inferInsert> = {};
  if (data.agencyProfileId !== undefined) v.agencyProfileId = data.agencyProfileId;
  if (data.title !== undefined) v.title = data.title;
  if (data.client !== undefined) v.client = data.client;
  if (data.sector !== undefined) v.sector = data.sector;
  if (data.description !== undefined) v.description = data.description;
  if (data.problem !== undefined) v.problem = data.problem;
  if (data.solution !== undefined) v.solution = data.solution;
  if (data.services !== undefined) v.services = data.services.length ? JSON.stringify(data.services) : null;
  if (data.stack !== undefined) v.stack = data.stack.length ? JSON.stringify(data.stack) : null;
  if (data.deliverables !== undefined) v.deliverables = data.deliverables;
  if (data.result !== undefined) v.result = data.result;
  if (data.metric !== undefined) v.metric = data.metric;
  if (data.testimonial !== undefined) v.testimonial = data.testimonial;
  if (data.testimonialAuthor !== undefined) v.testimonialAuthor = data.testimonialAuthor;
  if (data.projectUrl !== undefined) v.projectUrl = data.projectUrl;
  if (data.durationLabel !== undefined) v.durationLabel = data.durationLabel;
  if (data.tags !== undefined) v.tags = data.tags.length ? JSON.stringify(data.tags) : null;
  if (data.notes !== undefined) v.notes = data.notes;
  if (data.highlight !== undefined) v.highlight = data.highlight;
  if (data.source !== undefined) v.source = data.source;
  if (data.sourceUrl !== undefined) v.sourceUrl = data.sourceUrl;
  return v;
}

// ── Projects CRUD ───────────────────────────────────────────────────

/**
 * Projects available to a given agency profile: the profile's own plus the
 * shared ones (agencyProfileId NULL). With no profileId, returns everything.
 * Flagship (highlight) first, then most-recently updated.
 */
export function getPortfolioProjects(profileId?: number | null): PortfolioProject[] {
  const base = db.select().from(portfolioProjects);
  const rows =
    profileId == null
      ? base.orderBy(desc(portfolioProjects.highlight), desc(portfolioProjects.updatedAt)).all()
      : base
          .where(or(isNull(portfolioProjects.agencyProfileId), eq(portfolioProjects.agencyProfileId, profileId)))
          .orderBy(desc(portfolioProjects.highlight), desc(portfolioProjects.updatedAt))
          .all();
  return rows.map(rowToProject);
}

export function getPortfolioProject(id: number): PortfolioProject | null {
  const r = db.select().from(portfolioProjects).where(eq(portfolioProjects.id, id)).get();
  return r ? rowToProject(r) : null;
}

export function createPortfolioProject(data: PortfolioProjectData): number {
  const now = new Date().toISOString();
  const res = db
    .insert(portfolioProjects)
    .values({ ...buildProjectValues(data), title: data.title, updatedAt: now })
    .run();
  return Number(res.lastInsertRowid);
}

/** Insert several projects at once (e.g. confirmed import). Returns inserted ids. */
export function createPortfolioProjects(items: PortfolioProjectData[]): number[] {
  return items.filter((p) => p.title && p.title.trim()).map((p) => createPortfolioProject(p));
}

export function updatePortfolioProject(id: number, data: Partial<PortfolioProjectData>): void {
  db.update(portfolioProjects)
    .set({ ...buildProjectValues(data), updatedAt: new Date().toISOString() })
    .where(eq(portfolioProjects.id, id))
    .run();
}

export function deletePortfolioProject(id: number): void {
  // Detach any enrichment questions pinned to this project so they aren't orphaned.
  db.update(profileEnrichment).set({ projectId: null }).where(eq(profileEnrichment.projectId, id)).run();
  db.delete(portfolioProjects).where(eq(portfolioProjects.id, id)).run();
}

// ── Enrichment ("AI interview") ─────────────────────────────────────

export interface EnrichmentQuestionInput {
  agencyProfileId?: number | null;
  projectId?: number | null;
  question: string;
  category?: "proof" | "process" | "differentiation" | "pricing" | "logistics" | "other";
  priority?: number;
}

export interface EnrichmentItem {
  id: number;
  agencyProfileId: number | null;
  projectId: number | null;
  question: string;
  answer: string | null;
  category: string;
  priority: number;
  status: string;
  createdAt: string;
  answeredAt: string | null;
}

/** Persist a batch of AI-generated questions as pending. Returns inserted ids. */
export function insertEnrichmentQuestions(items: EnrichmentQuestionInput[]): number[] {
  return items
    .filter((q) => q.question && q.question.trim())
    .map((q) => {
      const res = db
        .insert(profileEnrichment)
        .values({
          agencyProfileId: q.agencyProfileId ?? null,
          projectId: q.projectId ?? null,
          question: q.question.trim(),
          category: q.category ?? "other",
          priority: q.priority ?? 3,
          status: "pending",
        })
        .run();
      return Number(res.lastInsertRowid);
    });
}

export function listEnrichment(opts: { status?: "pending" | "answered" | "skipped"; profileId?: number | null } = {}): EnrichmentItem[] {
  const where = and(
    opts.status ? eq(profileEnrichment.status, opts.status) : undefined,
    opts.profileId != null
      ? or(isNull(profileEnrichment.agencyProfileId), eq(profileEnrichment.agencyProfileId, opts.profileId))
      : undefined,
  );
  const rows = db
    .select()
    .from(profileEnrichment)
    .where(where)
    .orderBy(profileEnrichment.priority, desc(profileEnrichment.createdAt))
    .all();
  return rows.map((r) => ({
    id: r.id,
    agencyProfileId: r.agencyProfileId ?? null,
    projectId: r.projectId ?? null,
    question: r.question,
    answer: r.answer ?? null,
    category: r.category,
    priority: r.priority,
    status: r.status,
    createdAt: r.createdAt,
    answeredAt: r.answeredAt ?? null,
  }));
}

export function answerEnrichmentItem(id: number, answer: string): void {
  const trimmed = answer.trim();
  db.update(profileEnrichment)
    .set({ answer: trimmed, status: "answered", answeredAt: new Date().toISOString() })
    .where(eq(profileEnrichment.id, id))
    .run();
}

export function skipEnrichmentItem(id: number): void {
  db.update(profileEnrichment).set({ status: "skipped" }).where(eq(profileEnrichment.id, id)).run();
}

/** Answered Q&A folded into the agency context block (agency-wide + per-project). */
export function getAnsweredKnowledge(profileId?: number | null): { question: string; answer: string; projectId: number | null }[] {
  const where = and(
    eq(profileEnrichment.status, "answered"),
    profileId != null
      ? or(isNull(profileEnrichment.agencyProfileId), eq(profileEnrichment.agencyProfileId, profileId))
      : undefined,
  );
  return db
    .select({ question: profileEnrichment.question, answer: profileEnrichment.answer, projectId: profileEnrichment.projectId })
    .from(profileEnrichment)
    .where(where)
    .orderBy(profileEnrichment.priority)
    .all()
    .map((r) => ({ question: r.question, answer: (r.answer ?? "").trim(), projectId: r.projectId ?? null }))
    .filter((r) => !!r.answer);
}

/**
 * Every question text already on record (any status) — fed back to the AI so a new
 * interview round doesn't repeat what was asked, answered or skipped.
 */
export function getExistingQuestionTexts(profileId?: number | null): string[] {
  const q = db.select({ question: profileEnrichment.question, answer: profileEnrichment.answer }).from(profileEnrichment);
  const rows =
    profileId == null
      ? q.all()
      : q.where(or(isNull(profileEnrichment.agencyProfileId), eq(profileEnrichment.agencyProfileId, profileId))).all();
  return rows.map((r) => r.question);
}
