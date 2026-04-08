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
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaign,
} from "@/services/campaign.service";
import { NotFoundError } from "@/services/errors";

describe("campaign.service", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM replies");
    testSqlite.exec("DELETE FROM emails");
    testSqlite.exec("DELETE FROM leads");
    testSqlite.exec("DELETE FROM campaigns");
  });

  describe("listCampaigns", () => {
    it("returns empty array initially", () => {
      const result = listCampaigns();
      expect(result).toEqual([]);
    });

    it("returns campaigns after insert", () => {
      createCampaign({ name: "Test Campaign" });
      const result = listCampaigns();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Campaign");
      expect(result[0].metrics).toEqual({
        sent: 0,
        opened: 0,
        openRate: 0,
        replies: 0,
      });
    });

    it("filters campaigns by status", () => {
      createCampaign({ name: "Active Campaign" });
      const { campaign } = createCampaign({ name: "Paused Campaign" });
      updateCampaign(campaign.id, { status: "paused" });

      const active = listCampaigns({ status: "active" });
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("Active Campaign");

      const paused = listCampaigns({ status: "paused" });
      expect(paused).toHaveLength(1);
      expect(paused[0].name).toBe("Paused Campaign");
    });
  });

  describe("createCampaign", () => {
    it("creates a campaign with correct defaults", () => {
      const { campaign, created } = createCampaign({ name: "My Campaign" });

      expect(created).toBe(true);
      expect(campaign).toBeDefined();
      expect(campaign.name).toBe("My Campaign");
      expect(campaign.dailyLimit).toBe(20);
      expect(campaign.qualityThreshold).toBe(40);
      expect(campaign.autopilot).toBe(false);
      expect(campaign.defaultTone).toBe("professional");
      expect(campaign.status).toBe("active");
      expect(campaign.id).toBeGreaterThan(0);
    });

    it("creates a campaign with custom values", () => {
      const { campaign } = createCampaign({
        name: "Custom Campaign",
        description: "A test description",
        dailyLimit: 50,
        qualityThreshold: 30,
        autopilot: true,
        defaultTone: "casual",
      });

      expect(campaign.name).toBe("Custom Campaign");
      expect(campaign.description).toBe("A test description");
      expect(campaign.dailyLimit).toBe(50);
      expect(campaign.qualityThreshold).toBe(30);
      expect(campaign.autopilot).toBe(true);
      expect(campaign.defaultTone).toBe("casual");
    });

    it("returns existing campaign with idempotent flag", () => {
      const { campaign: first } = createCampaign({ name: "Idempotent" });
      const { campaign: second, created } = createCampaign(
        { name: "Idempotent" },
        { idempotent: true }
      );

      expect(created).toBe(false);
      expect(second.id).toBe(first.id);
    });

    it("creates duplicate without idempotent flag", () => {
      createCampaign({ name: "Duplicate" });
      const { created } = createCampaign({ name: "Duplicate" });
      expect(created).toBe(true);

      const all = listCampaigns();
      expect(all).toHaveLength(2);
    });
  });

  describe("getCampaign", () => {
    it("returns campaign by id with metrics and lead count", () => {
      const { campaign } = createCampaign({ name: "Fetch Me" });
      const result = getCampaign(campaign.id);

      expect(result.name).toBe("Fetch Me");
      expect(result.leadCount).toBe(0);
      expect(result.metrics).toEqual({
        sent: 0,
        opened: 0,
        openRate: 0,
        replies: 0,
      });
    });

    it("throws NotFoundError for missing campaign", () => {
      expect(() => getCampaign(9999)).toThrow(NotFoundError);
    });
  });

  describe("updateCampaign", () => {
    it("updates fields correctly", () => {
      const { campaign } = createCampaign({ name: "Original" });

      const updated = updateCampaign(campaign.id, {
        name: "Updated",
        dailyLimit: 100,
        status: "paused",
      });

      expect(updated.name).toBe("Updated");
      expect(updated.dailyLimit).toBe(100);
      expect(updated.status).toBe("paused");
    });

    it("throws NotFoundError for non-existent id", () => {
      expect(() => updateCampaign(9999, { name: "Nope" })).toThrow(
        NotFoundError
      );
    });
  });

  describe("deleteCampaign", () => {
    it("removes the campaign", () => {
      const { campaign } = createCampaign({ name: "To Delete" });
      const result = deleteCampaign(campaign.id);

      expect(result).toEqual({ success: true });
      expect(listCampaigns()).toHaveLength(0);
    });

    it("throws NotFoundError for non-existent id", () => {
      expect(() => deleteCampaign(9999)).toThrow(NotFoundError);
    });
  });
});
