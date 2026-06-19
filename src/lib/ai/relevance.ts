/**
 * Pure relevance ranking for portfolio projects. Given a free-text hint (the
 * prospect's category/sector or an inbound message / Workana brief), rank the
 * projects so the most relevant ones can be cited in the generated copy. With no
 * hint, flagship + recency order (the input order) is preserved. No DB access —
 * kept pure so it is trivially unit-testable.
 */

export interface RankableProject {
  title?: string | null;
  sector?: string | null;
  client?: string | null;
  services?: string[];
  tags?: string[];
  stack?: string[];
  highlight?: boolean;
}

// Small bilingual stop-word set so common filler words don't create false matches.
const STOP = new Set([
  "the", "and", "for", "with", "que", "los", "las", "del", "una", "uno", "por",
  "con", "para", "como", "más", "este", "esta", "esa", "ese", "sus", "tus",
  "web", "sitio", "site", "page", "página", "negocio", "empresa", "cliente",
]);

function tokenize(s: string): string[] {
  const matches = s.toLowerCase().match(/[a-záéíóúñü0-9]+/g) || [];
  return matches.filter((w) => w.length > 2 && !STOP.has(w));
}

export function rankProjectsByRelevance<T extends RankableProject>(
  projects: T[],
  hint: string | null | undefined,
  max: number,
): T[] {
  const hintTokens = hint ? new Set(tokenize(hint)) : null;
  const scored = projects.map((p, i) => {
    let score = p.highlight ? 2 : 0;
    if (hintTokens && hintTokens.size) {
      const bag = [
        p.sector ?? "",
        p.client ?? "",
        p.title ?? "",
        ...(p.services ?? []),
        ...(p.tags ?? []),
        ...(p.stack ?? []),
      ].join(" ");
      for (const t of new Set(tokenize(bag))) {
        if (hintTokens.has(t)) score += 1;
      }
    }
    return { p, score, i };
  });
  // Highest score first; ties keep the input order (flagship + recency).
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, Math.max(0, max)).map((s) => s.p);
}
