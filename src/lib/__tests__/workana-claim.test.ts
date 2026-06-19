import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/test-db");
  return { db: testDb, getSetting: () => null, setSetting: () => {} };
});
vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

import { testSqlite } from "@/test/test-db";
import {
  claimProposalForSending,
  releaseProposalClaim,
  listApprovedForSending,
  markProposalSubmitted,
  markProposalFailed,
} from "@/db/workana";

function seedProject(slug: string): number {
  const r = testSqlite
    .prepare("INSERT INTO workana_projects (workana_project_id, title, status) VALUES (?, ?, 'evaluated')")
    .run(slug, `Test ${slug}`);
  return Number(r.lastInsertRowid);
}
function seedProposal(projectId: number, status = "approved"): number {
  const r = testSqlite
    .prepare(
      "INSERT INTO workana_proposals (project_id, cover_letter, bid_amount, delivery_days, status) VALUES (?, 'cover', 100, 5, ?)"
    )
    .run(projectId, status);
  return Number(r.lastInsertRowid);
}
function statusOf(id: number): string {
  return (testSqlite.prepare("SELECT status FROM workana_proposals WHERE id=?").get(id) as { status: string }).status;
}
const inQueue = (id: number) => listApprovedForSending().some((c) => c.id === id);

describe("workana send claim (crash-safe — never double-send)", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM workana_proposals; DELETE FROM workana_projects;");
  });

  it("claims approved → sending atomically; a second claim can never win", () => {
    const id = seedProposal(seedProject("p1"));
    expect(claimProposalForSending(id)).toBe(true);
    expect(statusOf(id)).toBe("sending");
    // The status='approved' guard makes a double-claim (→ double-send) impossible.
    expect(claimProposalForSending(id)).toBe(false);
  });

  it("a claimed OR sent proposal is NOT in the send queue (never re-picked on restart)", () => {
    const id = seedProposal(seedProject("p2"));
    expect(inQueue(id)).toBe(true); // approved → eligible
    claimProposalForSending(id);
    expect(inQueue(id)).toBe(false); // "sending" excluded — a restart won't re-send it
    markProposalSubmitted(id, "ref");
    expect(statusOf(id)).toBe("submitted");
    expect(inQueue(id)).toBe(false); // "submitted" excluded — already sent, never again
  });

  it("releaseProposalClaim returns a not-sent proposal to the queue for retry", () => {
    const id = seedProposal(seedProject("p3"));
    claimProposalForSending(id);
    releaseProposalClaim(id);
    expect(statusOf(id)).toBe("approved");
    expect(inQueue(id)).toBe(true);
  });

  it("release only acts on a 'sending' row (won't resurrect a submitted one)", () => {
    const id = seedProposal(seedProject("p4"));
    markProposalSubmitted(id, "ref");
    releaseProposalClaim(id); // no-op: not in "sending"
    expect(statusOf(id)).toBe("submitted");
  });

  it("non-approved proposals (draft/failed) cannot be claimed, stay out of the queue", () => {
    const draft = seedProposal(seedProject("p5"), "draft");
    expect(claimProposalForSending(draft)).toBe(false);
    expect(statusOf(draft)).toBe("draft");
    const failedId = seedProposal(seedProject("p6"));
    markProposalFailed(failedId, "closed");
    expect(statusOf(failedId)).toBe("failed");
    expect(inQueue(failedId)).toBe(false);
  });
});
