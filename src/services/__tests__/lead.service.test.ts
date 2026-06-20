import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/test-db");
  return { db: testDb, getSetting: () => null, setSetting: () => {} };
});
vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));

import { testSqlite } from "@/test/test-db";
import { searchLeads, getLeadFacets } from "@/services/lead.service";

function seed(name: string, source: string | null, tags: string[] | null, opp = 50) {
  testSqlite
    .prepare("INSERT INTO leads (name, source, tags, opportunity_score, status) VALUES (?, ?, ?, ?, 'imported')")
    .run(name, source, tags ? JSON.stringify(tags) : null, opp);
}

beforeEach(() => {
  testSqlite.exec("DELETE FROM leads");
  seed("Dermasur", "csv", ["dermatólogo", "CDMX"], 80);
  seed("Cardio Centro", "search", ["cardiólogo"], 60);
  seed("Sin tags", "csv", null, 40);
});

describe("searchLeads filters", () => {
  it("filters by source", () => {
    const { leads, total } = searchLeads({ source: "csv" });
    expect(total).toBe(2);
    expect(leads.map((l) => l.name).sort()).toEqual(["Dermasur", "Sin tags"]);
  });

  it("filters by tag (quoted-token match)", () => {
    const { leads } = searchLeads({ tags: "dermatólogo" });
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Dermasur");
  });
});

describe("getLeadFacets", () => {
  it("returns distinct sources and flattened tags", () => {
    const { sources, tags } = getLeadFacets();
    expect(sources.sort()).toEqual(["csv", "search"]);
    expect(tags).toEqual(["CDMX", "cardiólogo", "dermatólogo"]); // sorted
  });
});
