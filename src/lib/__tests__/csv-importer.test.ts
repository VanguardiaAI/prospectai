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

import * as XLSX from "xlsx";
import { testSqlite } from "@/test/test-db";
import {
  suggestMapping,
  parseTabular,
  importLeadsFromRows,
  importLeadsFromCSV,
} from "@/lib/csv-importer";

beforeEach(() => {
  testSqlite.exec("DELETE FROM job_queue");
  testSqlite.exec("DELETE FROM leads");
  testSqlite.exec("DELETE FROM blacklist");
});

describe("suggestMapping", () => {
  it("auto-maps known Spanish/English/Outscraper headers, ignores unknown", () => {
    const m = suggestMapping(["Nombre", "Correo", "Teléfono", "Sitio Web", "Especialidad", "Notas raras"]);
    expect(m["Nombre"]).toBe("name");
    expect(m["Correo"]).toBe("email");
    expect(m["Teléfono"]).toBe("phone");
    expect(m["Sitio Web"]).toBe("website");
    expect(m["Especialidad"]).toBe("category");
    expect(m["Notas raras"]).toBe(""); // unknown → ignore
  });
});

describe("parseTabular", () => {
  it("parses a CSV buffer into headers + string rows", () => {
    const csv = "Nombre,Correo\nClínica A,a@a.mx\nClínica B,b@b.mx\n";
    const { headers, rows } = parseTabular(Buffer.from(csv), "leads.csv");
    expect(headers).toEqual(["Nombre", "Correo"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Nombre: "Clínica A", Correo: "a@a.mx" });
  });

  it("parses an XLSX buffer into headers + string rows", () => {
    const ws = XLSX.utils.json_to_sheet([
      { Nombre: "Clínica A", Teléfono: 5551234, Especialidad: "Dental" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const { headers, rows } = parseTabular(buf, "contactos.xlsx");
    expect(headers).toEqual(["Nombre", "Teléfono", "Especialidad"]);
    expect(rows[0].Nombre).toBe("Clínica A");
    expect(rows[0].Teléfono).toBe("5551234"); // numbers come back as strings
  });
});

describe("importLeadsFromRows", () => {
  it("imports with an explicit mapping, recording source and tags", () => {
    const rows = [
      { Negocio: "Dermatología Sur", Mail: "dra.ruiz@dermasur.mx", Cel: "+525511112222", Giro: "Dermatólogo" },
      { Negocio: "Sin nombre vacío", Mail: "", Cel: "", Giro: "" },
    ];
    const mapping = { Negocio: "name", Mail: "email", Cel: "phone", Giro: "category" };
    const res = importLeadsFromRows(rows, { mapping, tags: ["dermatólogo", "CDMX"], source: "csv" });

    expect(res.imported).toBe(2);
    const row = testSqlite.prepare("SELECT name, email, category, source, tags FROM leads WHERE name = ?").get("Dermatología Sur") as Record<string, string>;
    expect(row.email).toBe("dra.ruiz@dermasur.mx");
    expect(row.category).toBe("Dermatólogo");
    expect(row.source).toBe("csv");
    expect(JSON.parse(row.tags)).toEqual(["dermatólogo", "CDMX"]);
  });

  it("skips rows without a mapped name and dedups by phone within the batch", () => {
    const rows = [
      { N: "A", T: "555000111" },
      { N: "", T: "555999" },          // no name → skipped
      { N: "A dup", T: "555000111" },  // same phone → duplicate
    ];
    const res = importLeadsFromRows(rows, { mapping: { N: "name", T: "phone" } });
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.duplicates).toBe(1);
  });

  it("importLeadsFromCSV (back-compat) auto-maps and defaults source to csv", () => {
    const csv = "nombre,correo\nClínica Z,z@z.mx\n";
    const res = importLeadsFromCSV(csv);
    expect(res.imported).toBe(1);
    const row = testSqlite.prepare("SELECT source FROM leads WHERE name = ?").get("Clínica Z") as Record<string, string>;
    expect(row.source).toBe("csv");
  });
});
