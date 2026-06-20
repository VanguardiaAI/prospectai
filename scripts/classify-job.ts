/**
 * Read-only: classify a finished search job's results with the current quality
 * rules and estimate how many are NEW vs already-imported.
 * Usage: npx tsx scripts/classify-job.ts <searchJobId>
 */
import Database from "better-sqlite3";
import path from "node:path";
import { classifyLead, hasContactEmail, extractDomain } from "../src/lib/lead-quality";

const jobId = process.argv[2] || "3";
const db = new Database(path.join(process.cwd(), "data", "prospect-ai.db"), { readonly: true });

const job = db.prepare("SELECT results FROM search_jobs WHERE id = ?").get(jobId) as { results: string | null };
const places: Array<Record<string, string>> = JSON.parse(job?.results || "[]");

const existing = db.prepare("SELECT name, phone, website FROM leads").all() as Array<{ name: string; phone: string | null; website: string | null }>;
const exName = new Set(existing.map(l => (l.name || "").toLowerCase().trim()));
const exPhone = new Set(existing.filter(l => l.phone).map(l => l.phone as string));
const exDom = new Set(existing.map(l => extractDomain(l.website)).filter(Boolean) as string[]);

const tiers = { good: 0, low: 0, excluded: 0 } as Record<string, number>;
let withEmail = 0, fresh = 0, goodFresh = 0;

for (const p of places) {
  const q = classifyLead({ name: p.title, category: p.category, website: p.website, emails: p.emails, phone: p.phone });
  tiers[q.tier]++;
  if (hasContactEmail(p.emails)) withEmail++;

  const dom = extractDomain(p.website);
  const isDup =
    exName.has((p.title || "").toLowerCase().trim()) ||
    (!!p.phone && exPhone.has(p.phone)) ||
    (!!dom && exDom.has(dom));
  if (!isDup) {
    fresh++;
    if (q.tier === "good") goodFresh++;
  }
}

console.log(JSON.stringify({
  total: places.length,
  tiers,
  withEmail,
  freshVsExisting: { nuevos: fresh, yaEnBase: places.length - fresh },
  goodAndNew: goodFresh,
}, null, 2));
db.close();
