import { db, getSetting } from "@/db";
import { workanaProjects, workanaProposals, workanaSearches, workanaReplies, agencyProfile } from "@/db/schema";
import { eq, desc, and, gte, like, inArray } from "drizzle-orm";
import type { ScrapedProject, ScrapedInboxMessage } from "@/lib/workana/types";
import type { ProjectEvaluation, ProposalDraft } from "@/lib/workana/ai";
import type { ReplyIntent } from "@/lib/reply-intent";
import { WORKANA_DEFAULTS } from "@/lib/workana/priority";

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
        publishedAt: p.publishedAt ?? null,
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
      publishedAt: p.publishedAt ?? null,
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

/** Recommended projects only (shouldBid), best-fit first. Discarded ones are hidden
 *  from the UI; the scan summary still reports how many were evaluated/skipped. */
export function listProjects(limit = 120) {
  return db
    .select()
    .from(workanaProjects)
    .where(eq(workanaProjects.shouldBid, true))
    .orderBy(desc(workanaProjects.fitScore), desc(workanaProjects.scannedAt))
    .limit(limit)
    .all();
}

/**
 * Recommended (shouldBid) projects that have NO proposal yet, best-fit + freshest
 * first. The scan drafts from THIS pool (not just the current run's fresh batch),
 * so a high-fit project beyond a single run's draft cap — or recommended in an
 * earlier run — still gets a draft on a later scan instead of being stranded
 * (dedup stops known projects being re-evaluated, so they'd never be re-drafted).
 */
export function listDraftableProjects(limit: number) {
  const claimed = new Set(
    db
      .select({ pid: workanaProposals.projectId })
      .from(workanaProposals)
      .all()
      .map((r) => r.pid)
      .filter((x): x is number => x != null)
  );
  const rows = db
    .select()
    .from(workanaProjects)
    .where(eq(workanaProjects.shouldBid, true))
    .orderBy(desc(workanaProjects.fitScore), desc(workanaProjects.scannedAt))
    .all();
  return rows.filter((r) => !claimed.has(r.id)).slice(0, Math.max(0, limit));
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
  status?: "draft" | "approved" | "rejected" | "sending" | "submitted" | "failed";
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
      deliveryDays: workanaProposals.deliveryDays,
      slug: workanaProjects.workanaProjectId,
      language: workanaProjects.language,
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

/**
 * Style examples for drafting: recent cover letters the user already approved or
 * submitted, ranked by skill overlap with the target project (so the style matches
 * the kind of project) and recency. Returns just the cover-letter texts.
 *
 * Limit comes from `workana_style_examples` (default 5); set it to "0" to disable.
 */
export function getStyleExamples(opts: {
  skills?: string[];
  excludeProjectId?: number | null;
  limit?: number;
} = {}): string[] {
  let limit = opts.limit;
  if (limit == null) {
    const raw = getSetting("workana_style_examples");
    const n = raw == null || raw === "" ? 5 : Number(raw);
    limit = Number.isFinite(n) ? n : 5;
  }
  if (limit <= 0) return [];

  const rows = db
    .select({
      coverLetter: workanaProposals.coverLetter,
      projectId: workanaProposals.projectId,
      updatedAt: workanaProposals.updatedAt,
      skills: workanaProjects.skills,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .where(inArray(workanaProposals.status, ["approved", "submitted"]))
    .orderBy(desc(workanaProposals.updatedAt))
    .limit(40)
    .all();

  const target = new Set(
    (opts.skills ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean)
  );
  const scored = rows
    .filter((r) => r.coverLetter && r.coverLetter.trim() && r.projectId !== opts.excludeProjectId)
    .map((r) => {
      let overlap = 0;
      if (target.size && r.skills) {
        try {
          const rs = JSON.parse(r.skills) as unknown;
          if (Array.isArray(rs)) {
            for (const s of rs) if (target.has(String(s).toLowerCase().trim())) overlap++;
          }
        } catch {
          /* ignore malformed skills JSON */
        }
      }
      return { text: r.coverLetter, overlap, updatedAt: r.updatedAt ?? "" };
    });
  // Best skill overlap first, then most recent.
  scored.sort((a, b) => b.overlap - a.overlap || (a.updatedAt < b.updatedAt ? 1 : -1));
  return scored.slice(0, limit).map((s) => s.text);
}

/**
 * Cover-letter texts of proposals we've sent or queued (submitted/approved/sending).
 * Used to recognize our OWN outgoing messages in the inbox scrape so they are not
 * mistaken for client replies (the inbox preview of a thread we bid on starts with
 * our proposal text). See processWorkanaReplies.
 */
export function getOwnProposalCovers(): string[] {
  const rows = db
    .select({ coverLetter: workanaProposals.coverLetter })
    .from(workanaProposals)
    .where(inArray(workanaProposals.status, ["submitted", "approved", "sending"]))
    .all();
  return rows.map((r) => r.coverLetter).filter((c): c is string => !!c && c.trim().length > 0);
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
    budget: Number(getSetting("workana_weekly_connections")) || WORKANA_DEFAULTS.weeklyConnections,
  };
}

/** Sends made so far today (local day) — for the optional soft daily cap. */
export function getTodaySubmittedCount(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return countSubmittedSince(d.toISOString());
}

/** Most recent real-send timestamp (ISO) — used to enforce the send-spacing gap. */
export function getLastSubmittedAt(): string | null {
  const row = db
    .select({ submittedAt: workanaProposals.submittedAt })
    .from(workanaProposals)
    .where(eq(workanaProposals.status, "submitted"))
    .orderBy(desc(workanaProposals.submittedAt))
    .limit(1)
    .get();
  return row?.submittedAt ?? null;
}

/**
 * Approved proposals ready to auto-send, with the fields needed to rank them
 * (fit + recency + confidence) and to submit them. Ranking is done in JS by the
 * caller via priorityScore so the scanner, sender and review UI stay consistent.
 */
export function listApprovedForSending() {
  return db
    .select({
      id: workanaProposals.id,
      coverLetter: workanaProposals.coverLetter,
      bidAmount: workanaProposals.bidAmount,
      deliveryDays: workanaProposals.deliveryDays,
      confidence: workanaProposals.confidence,
      createdAt: workanaProposals.createdAt,
      slug: workanaProjects.workanaProjectId,
      language: workanaProjects.language,
      fitScore: workanaProjects.fitScore,
      publishedAt: workanaProjects.publishedAt,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .where(eq(workanaProposals.status, "approved"))
    .all();
}

/**
 * Mark a proposal as failed (e.g. Workana rejected the send), so the auto-send
 * queue advances instead of retrying the same blocking proposal every tick.
 */
export function markProposalFailed(id: number, error: string | null): void {
  const now = new Date().toISOString();
  db.update(workanaProposals)
    .set({ status: "failed", errorMessage: error ? error.slice(0, 300) : null, updatedAt: now })
    .where(eq(workanaProposals.id, id))
    .run();
}

/**
 * Atomically CLAIM a proposal for sending: flip approved → "sending" in one
 * statement, returning true only for the single caller that won. Done BEFORE the
 * slow real send so that a crash/restart mid-send leaves it in "sending" (never
 * re-picked, since senders only take "approved") instead of re-sending it. The
 * status==='approved' guard also makes a double-claim impossible.
 */
export function claimProposalForSending(id: number): boolean {
  const res = db
    .update(workanaProposals)
    .set({ status: "sending", updatedAt: new Date().toISOString() })
    .where(and(eq(workanaProposals.id, id), eq(workanaProposals.status, "approved")))
    .run();
  return res.changes === 1;
}

/**
 * Release a claim (sending → approved) when a send did NOT go through and is safe
 * to retry (e.g. the session was logged out before the bid was ever posted).
 */
export function releaseProposalClaim(id: number): void {
  db.update(workanaProposals)
    .set({ status: "approved", updatedAt: new Date().toISOString() })
    .where(and(eq(workanaProposals.id, id), eq(workanaProposals.status, "sending")))
    .run();
}

/** Proposals stuck in "sending" (a crash interrupted a real send) — surfaced so the
 *  user can verify on Workana and decide, never auto-resent. */
export function listStuckSending() {
  return db
    .select({
      id: workanaProposals.id,
      updatedAt: workanaProposals.updatedAt,
      projectTitle: workanaProjects.title,
    })
    .from(workanaProposals)
    .leftJoin(workanaProjects, eq(workanaProjects.id, workanaProposals.projectId))
    .where(eq(workanaProposals.status, "sending"))
    .all();
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
