/**
 * Smoke test for the refactored copy generation.
 *
 * Picks N leads with completed web analysis from the local DB, runs both
 * generateEmail and generateWhatsApp for each, and prints the result to
 * stdout. Uses the real `claude -p` CLI (Opus 4.7) just like production.
 *
 * Usage:  npx tsx scripts/smoke-copy.ts [count]
 *         npx tsx scripts/smoke-copy.ts 3
 */

import fs from "node:fs";
import { generateEmail } from "@/lib/ai/email";
import { generateWhatsApp } from "@/lib/ai/whatsapp";
import { defaultWebAnalysis, type WebAnalysis } from "@/lib/ai/types";

type LeadRow = {
  id: number;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  web_quality_score: number | null;
  analysis_json: string | null;
  analysis_summary: string | null;
};

function parseAnalysis(row: LeadRow): WebAnalysis {
  if (row.analysis_json) {
    try {
      const parsed = JSON.parse(row.analysis_json);
      return { ...defaultWebAnalysis(row.website, row.web_quality_score ?? 0, row.analysis_summary ?? ""), ...parsed };
    } catch {
      // fallthrough
    }
  }
  return defaultWebAnalysis(row.website, row.web_quality_score ?? 0, row.analysis_summary ?? "");
}

function inferCountry(state: string | null, city: string | null): string {
  // Lightweight heuristic; production code uses the lead's actual country.
  const s = `${state ?? ""} ${city ?? ""}`.toLowerCase();
  if (/m[eé]xico|cdmx|cancun|guadalajara|monterrey|puebla|coyoac/.test(s)) return "MX";
  if (/madrid|barcelona|sevilla|valencia|bilbao|espa/.test(s)) return "ES";
  if (/buenos aires|argentina|c[oó]rdoba|rosario/.test(s)) return "AR";
  if (/bogot[aá]|medell[ií]n|colombia|cali/.test(s)) return "CO";
  return "MX";
}

function divider(label: string) {
  const line = "─".repeat(76);
  console.log(`\n${line}\n${label}\n${line}`);
}

async function main() {
  const fromName = "Pablo";
  const leadsPath = process.argv[2] ?? "/tmp/smoke-leads/leads.json";

  if (!fs.existsSync(leadsPath)) {
    console.error(`Leads file not found at ${leadsPath}. Generate it with:`);
    console.error(`  sqlite3 data/prospect-ai.db ".mode json" ".output ${leadsPath}" "SELECT id,name,category,city,state,website,web_quality_score,analysis_json,analysis_summary FROM leads WHERE analysis_json IS NOT NULL ORDER BY RANDOM() LIMIT 2;"`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(leadsPath, "utf-8")) as LeadRow[];

  if (rows.length === 0) {
    console.error("No leads in JSON file.");
    process.exit(1);
  }

  console.log(`\nGenerating ${rows.length} email + WhatsApp pair(s) using Claude Opus 4.7 via local CLI…`);

  for (const lead of rows) {
    const analysis = parseAnalysis(lead);
    const country = inferCountry(lead.state, lead.city);

    divider(`LEAD #${lead.id} — ${lead.name} — ${lead.category ?? "?"} — ${lead.city ?? "?"} — score ${lead.web_quality_score ?? "?"} — country ${country}`);

    try {
      const startedAt = Date.now();
      const [email, wa] = await Promise.all([
        generateEmail(
          lead.name,
          lead.category,
          lead.city,
          lead.website,
          analysis,
          "professional",
          fromName,
          undefined,
          undefined,
          country,
        ),
        generateWhatsApp(
          lead.name,
          lead.category,
          lead.city,
          lead.website,
          analysis,
          "friendly",
          fromName,
          undefined,
          undefined,
          country,
        ),
      ]);
      const elapsedMs = Date.now() - startedAt;

      console.log(`\n📧 EMAIL (asunto: ${email.subject.length} chars, cuerpo: ${email.bodyText.split(/\s+/).length} palabras)`);
      console.log(`   Asunto: ${email.subject}\n`);
      console.log(email.bodyText.split("\n").map((l) => `   ${l}`).join("\n"));

      console.log(`\n📱 WHATSAPP (${wa.message.length} chars)\n`);
      console.log(wa.message.split("\n").map((l) => `   ${l}`).join("\n"));

      console.log(`\n⏱  ${elapsedMs}ms (ambas en paralelo)\n`);
    } catch (e) {
      console.error(`❌ Failed for lead ${lead.id}: ${(e as Error).message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
