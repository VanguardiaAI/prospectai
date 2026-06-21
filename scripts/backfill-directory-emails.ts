/**
 * One-off (idempotent) cleanup: remove directory/aggregator emails (Doctoralia /
 * Docplanner / Doctoranytime …) that were scraped as a lead's contact. They reach
 * the directory's support inbox, never the doctor/clinic, and being shared across
 * listings they also create false "same company" dedup matches.
 *
 *  1. Null any lead email field (email / contact_email / extracted_email) that is
 *     a directory address.
 *  2. Delete pending drafts (draft/held/approved) addressed to a directory email.
 *
 * Usage: npx tsx scripts/backfill-directory-emails.ts
 */
import Database from "better-sqlite3";
import path from "node:path";

// Keep in sync with IGNORED_DOMAINS (lead-quality) / DIRECTORY_DOMAINS (contact-history).
const DIRECTORIES = ["doctoralia", "docplanner", "doctoranytime"];
const DIR = new RegExp(DIRECTORIES.join("|"), "i");

const db = new Database(path.join(process.cwd(), "data", "prospect-ai.db"));

interface L { id: number; email: string | null; contact_email: string | null; extracted_email: string | null }

const likeAny = (col: string) => DIRECTORIES.map((d) => `${col} LIKE '%${d}%'`).join(" OR ");
const rows = db.prepare(
  `SELECT id, email, contact_email, extracted_email FROM leads
   WHERE ${likeAny("email")} OR ${likeAny("contact_email")} OR ${likeAny("extracted_email")}`,
).all() as L[];

const updLead = db.prepare("UPDATE leads SET email=?, contact_email=?, extracted_email=? WHERE id=?");

const result = db.transaction(() => {
  let leadsCleaned = 0;
  for (const l of rows) {
    updLead.run(
      DIR.test(l.email || "") ? null : l.email,
      DIR.test(l.contact_email || "") ? null : l.contact_email,
      DIR.test(l.extracted_email || "") ? null : l.extracted_email,
      l.id,
    );
    leadsCleaned++;
  }
  const draftsDeleted = db.prepare(
    `DELETE FROM emails WHERE status IN ('draft','held','approved') AND (${likeAny("to_email")})`,
  ).run().changes;
  return { leadsCleaned, draftsDeleted };
})();

console.log(JSON.stringify(result, null, 2));
db.close();
