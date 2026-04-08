import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");

  function getSetting(key: string): string | null {
    const row = testSqlite
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  function setSetting(key: string, value: string): void {
    testSqlite
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .run(key, value);
  }

  return {
    db: testDb,
    getSetting,
    setSetting,
  };
});

vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

vi.mock("@/db/settings", async () => {
  const { testSqlite } = await import("@/test/test-db");

  function getSetting(key: string): string | null {
    const row = testSqlite
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  function setSetting(key: string, value: string): void {
    testSqlite
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .run(key, value);
  }

  return {
    getSetting,
    setSetting,
    initializeDefaultSettings: vi.fn(),
  };
});

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/mcp/helpers/validators", () => ({
  checkFullConfig: vi.fn(() => ({})),
}));

import { testSqlite } from "@/test/test-db";
import {
  getAllSettings,
  updateSettings,
} from "@/services/settings.service";

// Local helpers for seeding data in tests
function seedSetting(key: string, value: string): void {
  testSqlite
    .prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    )
    .run(key, value);
}

function readSetting(key: string): string | null {
  const row = testSqlite
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

describe("settings.service", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM settings");
    testSqlite.exec("DELETE FROM activity_log");
  });

  describe("getAllSettings", () => {
    it("returns empty map when no settings exist", () => {
      const result = getAllSettings();
      expect(result).toEqual({});
    });

    it("returns key-value map of settings", () => {
      seedSetting("agency_name", "TestAgency");
      seedSetting("from_email", "test@example.com");

      const result = getAllSettings();
      expect(result).toEqual({
        agency_name: "TestAgency",
        from_email: "test@example.com",
      });
    });

    it("reflects updated values", () => {
      seedSetting("agency_name", "Old");
      seedSetting("agency_name", "New");

      const result = getAllSettings();
      expect(result.agency_name).toBe("New");
    });
  });

  describe("updateSettings", () => {
    it("inserts new settings", () => {
      const result = updateSettings({
        agency_name: "MyAgency",
        from_email: "hello@myagency.com",
      });

      expect(result.success).toBe(true);
      expect(result.updated).toContain("agency_name");
      expect(result.updated).toContain("from_email");

      expect(readSetting("agency_name")).toBe("MyAgency");
      expect(readSetting("from_email")).toBe("hello@myagency.com");
    });

    it("reports only changed keys", () => {
      seedSetting("agency_name", "Same");

      const result = updateSettings({
        agency_name: "Same",
        from_email: "new@example.com",
      });

      expect(result.updated).not.toContain("agency_name");
      expect(result.updated).toContain("from_email");
    });

    it("returns empty updated array when nothing changes", () => {
      seedSetting("agency_name", "Same");

      const result = updateSettings({ agency_name: "Same" });

      expect(result.updated).toEqual([]);
    });

    it("overwrites existing settings", () => {
      seedSetting("default_tone", "professional");

      updateSettings({ default_tone: "casual" });

      expect(readSetting("default_tone")).toBe("casual");
    });
  });
});
