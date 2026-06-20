/**
 * One-off (idempotent) backfill: scrub the "site is broken / cut off / incomplete"
 * hallucination out of analyses that were stored BEFORE the anti-hallucination fix.
 *
 * For every lead it re-runs sanitizeIssues over analysis_json.issues/seoIssues and
 * sanitizeSummary over analysis_json.summary AND the analysis_summary column.
 * Safe to run multiple times (sanitizing clean data is a no-op).
 *
 * Usage:  npx tsx scripts/backfill-sanitize-analysis.ts [path/to/db]
 * Default DB: ./data/prospect-ai.db
 */
import Database from "better-sqlite3";
import path from "node:path";
import { sanitizeIssues, sanitizeSummary } from "../src/lib/lead-quality";

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "prospect-ai.db");
const db = new Database(dbPath);

interface Row {
  id: number;
  analysis_json: string | null;
  analysis_summary: string | null;
}

const rows = db
  .prepare("SELECT id, analysis_json, analysis_summary FROM leads WHERE analysis_json IS NOT NULL OR analysis_summary IS NOT NULL")
  .all() as Row[];

const upd = db.prepare("UPDATE leads SET analysis_json = ?, analysis_summary = ? WHERE id = ?");

let scanned = 0;
let changed = 0;
let emptiedSummaries = 0;

const run = db.transaction(() => {
  for (const r of rows) {
    scanned++;

    let json = r.analysis_json;
    if (r.analysis_json) {
      try {
        const parsed = JSON.parse(r.analysis_json);
        if (Array.isArray(parsed.issues)) parsed.issues = sanitizeIssues(parsed.issues);
        if (Array.isArray(parsed.seoIssues)) parsed.seoIssues = sanitizeIssues(parsed.seoIssues);
        if (typeof parsed.summary === "string") parsed.summary = sanitizeSummary(parsed.summary);
        json = JSON.stringify(parsed);
      } catch {
        /* leave malformed JSON untouched */
      }
    }

    const newSummary = sanitizeSummary(r.analysis_summary) || null;

    if (json !== r.analysis_json || newSummary !== r.analysis_summary) {
      upd.run(json, newSummary, r.id);
      changed++;
      if (r.analysis_summary && !newSummary) emptiedSummaries++;
    }
  }
});
run();

console.log(JSON.stringify({ db: dbPath, scanned, changed, emptiedSummaries }, null, 2));
db.close();
