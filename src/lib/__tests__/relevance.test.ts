import { describe, it, expect } from "vitest";
import { rankProjectsByRelevance } from "@/lib/ai/relevance";

const P = (over: Partial<Parameters<typeof rankProjectsByRelevance>[0][number]> & { id: number }) => ({
  title: `Project ${over.id}`,
  sector: null,
  client: null,
  services: [],
  tags: [],
  stack: [],
  highlight: false,
  ...over,
});

describe("rankProjectsByRelevance", () => {
  it("with no hint, flagship projects come first, then input order", () => {
    const a = P({ id: 1 });
    const b = P({ id: 2, highlight: true });
    const c = P({ id: 3 });
    const out = rankProjectsByRelevance([a, b, c], null, 10);
    expect(out.map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it("ranks the project whose sector/tags overlap the hint above the rest", () => {
    const dental = P({ id: 1, sector: "clínica dental", tags: ["salud"] });
    const resto = P({ id: 2, sector: "restaurante", tags: ["gastronomía"] });
    const out = rankProjectsByRelevance([resto, dental], "clínica dental en Madrid", 10);
    expect(out[0].id).toBe(1);
  });

  it("a strong content match outranks a flagship with no overlap", () => {
    const flagshipOther = P({ id: 1, highlight: true, sector: "abogados" });
    const match = P({ id: 2, sector: "ecommerce", services: ["tienda online"], tags: ["ecommerce"] });
    const out = rankProjectsByRelevance([flagshipOther, match], "necesito una tienda online ecommerce", 10);
    expect(out[0].id).toBe(2);
  });

  it("respects the max and ignores short/stop words", () => {
    const a = P({ id: 1, sector: "web" }); // "web" is a stop word → no false match
    const b = P({ id: 2, sector: "logística" });
    const out = rankProjectsByRelevance([a, b], "una web para mi negocio", 1);
    expect(out).toHaveLength(1);
  });

  it("max of 0 returns an empty list", () => {
    expect(rankProjectsByRelevance([P({ id: 1 })], "anything", 0)).toEqual([]);
  });
});
