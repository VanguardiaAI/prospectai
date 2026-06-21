/**
 * Wipe the pending review queue and re-queue generation so every draft is rebuilt
 * with the current (fixed) prompt. Generation is queue-driven (see cron/email-
 * generation + wa-generation); the running scheduler drains the queue (~5/tick),
 * regenerating with the new copy. Mirrors the original channel mix: a lead that had
 * an email draft gets a generate_email job, one that had a WhatsApp draft gets a
 * generate_wa job (the WA cron still applies the email-first/held policy).
 *
 * Usage: npx tsx scripts/regenerate-drafts.ts
 */
import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(path.join(process.cwd(), "data", "prospect-ai.db"));
const PENDING = "('draft','held','approved')";

const emailLeads = db.prepare(`SELECT DISTINCT lead_id AS id FROM emails WHERE status IN ${PENDING}`).all().map((r) => (r as { id: number }).id);
const waLeads = db.prepare(`SELECT DISTINCT lead_id AS id FROM whatsapp_messages WHERE status IN ${PENDING}`).all().map((r) => (r as { id: number }).id);

const campOf = db.prepare("SELECT campaign_id AS c FROM leads WHERE id = ?");
const ins = db.prepare("INSERT INTO job_queue (type, lead_id, campaign_id, status) VALUES (?, ?, ?, 'pending')");
const resetStmt = db.prepare(
  "UPDATE leads SET status='analyzed' WHERE id = ? AND status IN ('email_generated','email_approved','wa_generated','wa_approved','contacted')",
);

const result = db.transaction(() => {
  const deletedEmail = db.prepare(`DELETE FROM emails WHERE status IN ${PENDING}`).run().changes;
  const deletedWa = db.prepare(`DELETE FROM whatsapp_messages WHERE status IN ${PENDING}`).run().changes;

  const affected = [...new Set([...emailLeads, ...waLeads])];
  let reset = 0;
  for (const id of affected) reset += resetStmt.run(id).changes;

  // Clear stale pending generate jobs so we don't double-queue.
  db.prepare("DELETE FROM job_queue WHERE type IN ('generate_email','generate_wa') AND status='pending'").run();

  let queuedEmail = 0;
  let queuedWa = 0;
  for (const id of emailLeads) { ins.run("generate_email", id, (campOf.get(id) as { c: number | null }).c); queuedEmail++; }
  for (const id of waLeads) { ins.run("generate_wa", id, (campOf.get(id) as { c: number | null }).c); queuedWa++; }

  return { deletedEmail, deletedWa, leadsReset: reset, queuedEmail, queuedWa };
})();

console.log(JSON.stringify(result, null, 2));
db.close();
