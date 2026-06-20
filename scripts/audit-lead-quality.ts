/**
 * Read-only audit: classify EXISTING leads with the current quality rules and
 * show the review-queue (drafts) breakdown. Helps decide what junk to purge.
 *
 * Usage: npx tsx scripts/audit-lead-quality.ts [path/to/db]
 */
import Database from "better-sqlite3";
import path from "node:path";
import { classifyLead } from "../src/lib/lead-quality";

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "prospect-ai.db");
const db = new Database(dbPath, { readonly: true });

interface L {
  id: number; name: string; category: string | null; website: string | null;
  email: string | null; extracted_email: string | null; contact_email: string | null;
  phone: string | null; source: string | null;
}

const rows = db.prepare(
  "SELECT id, name, category, website, email, extracted_email, contact_email, phone, source FROM leads",
).all() as L[];

const tiers = { good: 0, low: 0, excluded: 0 } as Record<string, number>;
const excludedNames: string[] = [];
const hiddenLowNames: string[] = [];

for (const l of rows) {
  const q = classifyLead({
    name: l.name, category: l.category, website: l.website,
    emails: [l.contact_email, l.extracted_email, l.email].filter(Boolean).join(","),
    phone: l.phone,
  });
  tiers[q.tier]++;
  if (q.tier === "excluded" && excludedNames.length < 10) excludedNames.push(l.name);
  if (q.tier === "low" && q.hiddenByDefault && hiddenLowNames.length < 10) hiddenLowNames.push(l.name);
}

const emailQueue = db.prepare("SELECT status, count(*) c FROM emails GROUP BY status").all();
const waQueue = db.prepare("SELECT status, count(*) c FROM whatsapp_messages GROUP BY status").all();

console.log(JSON.stringify({
  totalLeads: rows.length,
  tiers,
  excludedExamples: excludedNames,
  hiddenLowExamples: hiddenLowNames,
  emailQueue,
  waQueue,
}, null, 2));
db.close();
