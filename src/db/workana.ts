import { db, getSetting } from "@/db";
import { workanaProjects, workanaProposals, workanaSearches, workanaReplies, agencyProfile } from "@/db/schema";
import { eq, desc, and, gte, like } from "drizzle-orm";
import type { ScrapedProject, ScrapedInboxMessage } from "@/lib/workana/types";
import type { ProjectEvaluation, ProposalDraft } from "@/lib/workana/ai";
import type { ReplyIntent } from "@/lib/reply-intent";

/** All project ids already stored — used to dedup across scan runs. */
export function getKnownProjectIds(): Set<string> {
  const rows = db.select({ pid: workanaProjects.workanaProjectId }).from(workanaProjects).all();
  return new Set(rows.map((r) => r.pid));
}

export function getActiveSearches() {
  return db.select().from(workanaSearches).where(eq(workanaSearches.active, true)).all();
}

export function getDefaultProfileId(): number | null {
  const row =
    db.select({ id: agencyProfile.id }).from(agencyProfile).where(eq(agencyProfile.isDefault, true)).get() ??
    db.select({ id: agencyProfile.id }).from(agencyProfile).orderBy(agencyProfile.id).get();
  return row?.id ?? null;
}

/** Insert or update a scraped+evaluated project; returns its row id. */
export function upsertProject(
  p: ScrapedProject,
  evaluation: ProjectEvaluation,
  searchId?: number | null
): number {
  const now = new Date().toISOString();
  const status: "evaluated" | "skipped" = evaluation.shouldBid ? "evaluated" : "skipped";
  const existing = db
    .select({ id: workanaProjects.id })
    .from(workanaProjects)
    .where(eq(workanaProjects.workanaProjectId, p.workanaProjectId))
    .get();

  if (existing) {
    db.update(workanaProjects)
      .set({
        title: p.title,
        description: p.description,
        skills: p.skills.length ? JSON.stringify(p.skills) : null,
        bidsCount: p.bidsCount,
        language: evaluation.language,
        rawText: p.rawText,
        fitScore: evaluation.fitScore,
        shouldBid: evaluation.shouldBid,
        reason: evaluation.reason,
        status,
        scannedAt: now,
        updatedAt: now,
      })
      .where(eq(workanaProjects.id, existing.id))
      .run();
    return existing.id;
  }

  const res = db
    .insert(workanaProjects)
    .values({
      workanaProjectId: p.workanaProjectId,
      searchId: searchId ?? null,
      url: p.url,
      title: p.title,
      description: p.description,
      skills: p.skills.length ? JSON.stringify(p.skills) : null,
      budgetType: null,
      currency: null,
      bidsCount: p.bidsCount,
      language: evaluation.language,
      rawText: p.rawText,
      fitScore: evaluation.fitScore,
      shouldBid: evaluation.shouldBid,
      reason: evaluation.reason,
      status,
      scannedAt: now,
    })
    .run();
  return Number(res.lastInsertRowid);
}

/** Store an AI-drafted proposal (status=draft) and mark the project as drafted. */
export function insertProposal(
  projectId: number,
  agencyProfileId: number | null,
  draft: ProposalDraft,
  currency?: string | null
): number {
  const now = new Date().toISOString();
  const res = db
    .insert(workanaProposals)
    .values({
      projectId,
      agencyProfileId: agencyProfileId ?? null,
      coverLetter: draft.coverLetter,
      bidAmount: draft.bidAmount ?? null,
      currency: currency ?? null,
      deliveryDays: draft.deliveryDays ?? null,
      screeningAnswers: draft.screeningAnswers.length ? JSON.stringify(draft.screeningAnswers) : null,
      confidence: draft.confidence,
      status: "draft",
      updatedAt: now,
    })
    .run();
  db.update(workanaProjects).set({ status: "drafted", updatedAt: now }).where(eq(workanaProjects.id, projectId)).run();
  return Number(res.lastInsertRowid);
}

/** Does this project already have any proposal? Avoids re-drafting (one proposal per project). */
export function projectHasProposal(projectId: number): boolean {
  const row = db
    .select({ id: workanaProposals.id })
    .from(workanaProposals)
    .where(eq(workanaProposals.projectId, projectId))
    .get();
  return !!row;
}

export function listProjects(limit = 50) {
  return db
    .select()
    .from(workanaProjects)
    .orderBy(desc(workanaProjects.fitScore), desc(workanaProjects.scannedAt))
    .limit(limit)
    .all();
}

export function listProposals(limit = 50) {
  return db
    .select({
      id: workanaProposals.id,
      projectId: workanaProposals.projectId,
      coverLetter: workanaProposals.coverLetter,
      bidAmount: workanaProposals.bidAmount,
      currency: workanaProposals.currency,
      deliveryDays: workanaProposals.deliveryDays,
      confidence: workanaProposals.confidence,
      status: workanaProposals.status,
      createdAt: workanaProposals.createdAt,
      projectTitle: workanaProjects.title,
      projectUrl: workanaProjects.url,
      fitScore: workanaProjects.fitScore,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .orderBy(desc(workanaProposals.createdAt))
    .limit(limit)
    .all();
}

/** Detailed proposals for the review UI (full cover letter + screening + project context). */
export function getProposalsDetailed(limit = 60) {
  return db
    .select({
      id: workanaProposals.id,
      projectId: workanaProposals.projectId,
      agencyProfileId: workanaProposals.agencyProfileId,
      coverLetter: workanaProposals.coverLetter,
      bidAmount: workanaProposals.bidAmount,
      currency: workanaProposals.currency,
      deliveryDays: workanaProposals.deliveryDays,
      screeningAnswers: workanaProposals.screeningAnswers,
      confidence: workanaProposals.confidence,
      status: workanaProposals.status,
      submittedAt: workanaProposals.submittedAt,
      createdAt: workanaProposals.createdAt,
      projectTitle: workanaProjects.title,
      projectUrl: workanaProjects.url,
      fitScore: workanaProjects.fitScore,
      reason: workanaProjects.reason,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .orderBy(desc(workanaProposals.createdAt))
    .limit(limit)
    .all();
}

export interface ProposalEditFields {
  coverLetter?: string;
  bidAmount?: number | null;
  currency?: string | null;
  deliveryDays?: number | null;
  screeningAnswers?: Array<{ question: string; answer: string }>;
  confidence?: number;
  status?: "draft" | "approved" | "rejected" | "submitted" | "failed";
}

/** Patch a proposal's editable fields and/or status. */
export function updateProposal(id: number, fields: ProposalEditFields): void {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (fields.coverLetter !== undefined) set.coverLetter = fields.coverLetter;
  if (fields.bidAmount !== undefined) set.bidAmount = fields.bidAmount;
  if (fields.currency !== undefined) set.currency = fields.currency;
  if (fields.deliveryDays !== undefined) set.deliveryDays = fields.deliveryDays;
  if (fields.screeningAnswers !== undefined)
    set.screeningAnswers = fields.screeningAnswers.length ? JSON.stringify(fields.screeningAnswers) : null;
  if (fields.confidence !== undefined) set.confidence = fields.confidence;
  if (fields.status !== undefined) set.status = fields.status;
  db.update(workanaProposals).set(set).where(eq(workanaProposals.id, id)).run();
}

/** Proposal fields + project slug needed to submit it to Workana. */
export function getProposalForSubmit(id: number) {
  return db
    .select({
      id: workanaProposals.id,
      status: workanaProposals.status,
      coverLetter: workanaProposals.coverLetter,
      bidAmount: workanaProposals.bidAmount,
      slug: workanaProjects.workanaProjectId,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .where(eq(workanaProposals.id, id))
    .get();
}

/** Mark a proposal submitted (and its project), after a real send. */
export function markProposalSubmitted(id: number, ref: string | null): void {
  const now = new Date().toISOString();
  db.update(workanaProposals)
    .set({ status: "submitted", submittedAt: now, workanaProposalRef: ref, updatedAt: now })
    .where(eq(workanaProposals.id, id))
    .run();
  const row = db.select({ projectId: workanaProposals.projectId }).from(workanaProposals).where(eq(workanaProposals.id, id)).get();
  if (row?.projectId) {
    db.update(workanaProjects).set({ status: "submitted", updatedAt: now }).where(eq(workanaProjects.id, row.projectId)).run();
  }
}

/** The stored project row backing a proposal — used to regenerate the draft. */
export function getProjectRowForProposal(proposalId: number) {
  const prop = db
    .select({ projectId: workanaProposals.projectId, agencyProfileId: workanaProposals.agencyProfileId })
    .from(workanaProposals)
    .where(eq(workanaProposals.id, proposalId))
    .get();
  if (!prop) return null;
  const project = db.select().from(workanaProjects).where(eq(workanaProjects.id, prop.projectId)).get();
  return project ? { project, agencyProfileId: prop.agencyProfileId } : null;
}

/** Count proposals submitted since the given ISO timestamp (weekly-budget accounting). */
export function countSubmittedSince(isoTs: string): number {
  const rows = db
    .select({ id: workanaProposals.id })
    .from(workanaProposals)
    .where(and(eq(workanaProposals.status, "submitted"), gte(workanaProposals.submittedAt, isoTs)))
    .all();
  return rows.length;
}

/** Connections spent this week (proposals submitted since Monday) vs the configured budget. */
export function getWeeklyConnectionUsage(): { used: number; budget: number } {
  const d = new Date();
  const offset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return {
    used: countSubmittedSince(d.toISOString()),
    budget: Number(getSetting("workana_weekly_connections")) || 0,
  };
}

// ── Workana replies inbox ───────────────────────────────────────────

/** Already-stored external ids — dedup inbox messages across scans. */
export function getKnownReplyExternalIds(): Set<string> {
  const rows = db.select({ ext: workanaReplies.externalId }).from(workanaReplies).all();
  return new Set(rows.map((r) => r.ext).filter((x): x is string => !!x));
}

/** Link an inbox thread to a stored project by its Workana slug (exact). */
export function matchProjectBySlug(slug: string | null): number | null {
  if (!slug) return null;
  const row = db
    .select({ id: workanaProjects.id })
    .from(workanaProjects)
    .where(eq(workanaProjects.workanaProjectId, slug))
    .get();
  return row?.id ?? null;
}

/** Best-effort link an inbox thread to a stored project by title. */
export function matchProjectByTitle(title: string | null): number | null {
  if (!title || title.trim().length < 6) return null;
  const row = db
    .select({ id: workanaProjects.id })
    .from(workanaProjects)
    .where(like(workanaProjects.title, `%${title.trim().slice(0, 40)}%`))
    .get();
  return row?.id ?? null;
}

export function insertReply(
  msg: ScrapedInboxMessage,
  intent: ReplyIntent | null,
  suggestedReply: string | null,
  projectId: number | null
): number {
  const res = db
    .insert(workanaReplies)
    .values({
      projectId: projectId ?? null,
      externalId: msg.externalId,
      fromName: msg.fromName,
      body: msg.body,
      suggestedReply: suggestedReply ?? null,
      intent: intent ?? null,
      status: "unread",
    })
    .run();
  return Number(res.lastInsertRowid);
}

export function listReplies(limit = 60) {
  return db
    .select({
      id: workanaReplies.id,
      projectId: workanaReplies.projectId,
      fromName: workanaReplies.fromName,
      body: workanaReplies.body,
      suggestedReply: workanaReplies.suggestedReply,
      intent: workanaReplies.intent,
      status: workanaReplies.status,
      handledAt: workanaReplies.handledAt,
      receivedAt: workanaReplies.receivedAt,
      projectTitle: workanaProjects.title,
    })
    .from(workanaReplies)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaReplies.projectId))
    .orderBy(desc(workanaReplies.receivedAt))
    .limit(limit)
    .all();
}

export function setReplyStatus(id: number, status: "unread" | "handled"): void {
  db.update(workanaReplies)
    .set({ status, handledAt: status === "handled" ? new Date().toISOString() : null })
    .where(eq(workanaReplies.id, id))
    .run();
}
