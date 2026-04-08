import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { testDb } = await import("@/test/test-db");
  return {
    db: testDb,
    getSetting: () => null,
    setSetting: () => {},
  };
});

vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

vi.mock("@/lib/activity", () => ({
  logActivity: vi.fn(),
}));

import { testSqlite } from "@/test/test-db";
import {
  listBlacklist,
  addToBlacklist,
  removeFromBlacklist,
} from "@/services/blacklist.service";
import { ConflictError } from "@/services/errors";

describe("blacklist.service", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM blacklist");
  });

  describe("listBlacklist", () => {
    it("returns empty array initially", () => {
      const result = listBlacklist();
      expect(result).toEqual([]);
    });

    it("returns items after add", () => {
      addToBlacklist({ type: "domain", value: "spam.com" });
      addToBlacklist({ type: "email", value: "bad@actor.com" });

      const result = listBlacklist();
      expect(result).toHaveLength(2);
    });
  });

  describe("addToBlacklist", () => {
    it("adds an entry with correct data", () => {
      const result = addToBlacklist({
        type: "domain",
        value: "spam.com",
        reason: "Known spam domain",
      });

      expect(result.type).toBe("domain");
      expect(result.value).toBe("spam.com");
      expect(result.reason).toBe("Known spam domain");
      expect(result.id).toBeGreaterThan(0);
    });

    it("lowercases and trims the value", () => {
      const result = addToBlacklist({
        type: "email",
        value: "  BAD@Actor.COM  ",
      });

      expect(result.value).toBe("bad@actor.com");
    });

    it("adds business type entries", () => {
      const result = addToBlacklist({
        type: "business",
        value: "Scam Corp",
      });

      expect(result.type).toBe("business");
      expect(result.value).toBe("scam corp");
    });

    it("throws ConflictError on duplicate value", () => {
      addToBlacklist({ type: "domain", value: "duplicate.com" });

      expect(() =>
        addToBlacklist({ type: "domain", value: "duplicate.com" })
      ).toThrow(ConflictError);
    });

    it("throws ConflictError on duplicate with different casing", () => {
      addToBlacklist({ type: "domain", value: "DUPLICATE.com" });

      expect(() =>
        addToBlacklist({ type: "domain", value: "duplicate.com" })
      ).toThrow(ConflictError);
    });
  });

  describe("removeFromBlacklist", () => {
    it("removes an entry", () => {
      const entry = addToBlacklist({ type: "domain", value: "remove-me.com" });

      const result = removeFromBlacklist(entry.id);
      expect(result).toEqual({ success: true });

      const remaining = listBlacklist();
      expect(remaining).toHaveLength(0);
    });

    it("succeeds silently for non-existent id", () => {
      const result = removeFromBlacklist(9999);
      expect(result).toEqual({ success: true });
    });
  });
});
