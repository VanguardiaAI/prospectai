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
  approveEmails,
  updateEmail,
  listEmails,
} from "@/services/message.service";
import { NotFoundError } from "@/services/errors";

function seedCampaign(): number {
  const result = testSqlite
    .prepare(
      "INSERT INTO campaigns (name, daily_limit, quality_threshold, autopilot, default_tone, status) VALUES (?, 20, 40, 0, 'professional', 'active')"
    )
    .run("Test Campaign");
  return Number(result.lastInsertRowid);
}

function seedLead(campaignId: number): number {
  const result = testSqlite
    .prepare(
      "INSERT INTO leads (campaign_id, name, status) VALUES (?, ?, 'analyzed')"
    )
    .run(campaignId, "Test Lead");
  return Number(result.lastInsertRowid);
}

function seedEmail(leadId: number, campaignId: number): number {
  const result = testSqlite
    .prepare(
      "INSERT INTO emails (lead_id, campaign_id, to_email, subject, body_html, body_text, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')"
    )
    .run(
      leadId,
      campaignId,
      "test@example.com",
      "Test Subject",
      "<p>Test body</p>",
      "Test body"
    );
  return Number(result.lastInsertRowid);
}

describe("message.service", () => {
  let campaignId: number;
  let leadId: number;
  let emailId: number;

  beforeEach(() => {
    testSqlite.exec("DELETE FROM emails");
    testSqlite.exec("DELETE FROM leads");
    testSqlite.exec("DELETE FROM campaigns");
    testSqlite.exec("DELETE FROM activity_log");

    campaignId = seedCampaign();
    leadId = seedLead(campaignId);
    emailId = seedEmail(leadId, campaignId);
  });

  describe("listEmails", () => {
    it("returns seeded emails", () => {
      const result = listEmails({ status: "draft" });
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0].email.subject).toBe("Test Subject");
      expect(result.emails[0].leadName).toBe("Test Lead");
    });

    it("returns empty for non-matching status", () => {
      const result = listEmails({ status: "sent" });
      expect(result.emails).toHaveLength(0);
    });

    it("filters by campaignId", () => {
      const result = listEmails({ campaignId });
      expect(result.emails).toHaveLength(1);

      const result2 = listEmails({ campaignId: 9999 });
      expect(result2.emails).toHaveLength(0);
    });
  });

  describe("approveEmails", () => {
    it("changes email status to approved", () => {
      const result = approveEmails([emailId]);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      const email = testSqlite
        .prepare("SELECT status FROM emails WHERE id = ?")
        .get(emailId) as { status: string };
      expect(email.status).toBe("approved");
    });

    it("updates lead status to email_approved", () => {
      approveEmails([emailId]);

      const lead = testSqlite
        .prepare("SELECT status FROM leads WHERE id = ?")
        .get(leadId) as { status: string };
      expect(lead.status).toBe("email_approved");
    });

    it("handles multiple email ids", () => {
      const emailId2 = seedEmail(leadId, campaignId);
      const result = approveEmails([emailId, emailId2]);

      expect(result.count).toBe(2);

      const approved = testSqlite
        .prepare("SELECT status FROM emails WHERE status = 'approved'")
        .all();
      expect(approved).toHaveLength(2);
    });
  });

  describe("updateEmail", () => {
    it("updates email content fields", () => {
      const result = updateEmail(emailId, {
        subject: "Updated Subject",
        bodyHtml: "<p>Updated</p>",
        bodyText: "Updated",
      });

      expect(result.subject).toBe("Updated Subject");
      expect(result.bodyHtml).toBe("<p>Updated</p>");
      expect(result.bodyText).toBe("Updated");
    });

    it("updates lead status to rejected when email is rejected", () => {
      updateEmail(emailId, { status: "rejected" });

      const lead = testSqlite
        .prepare("SELECT status FROM leads WHERE id = ?")
        .get(leadId) as { status: string };
      expect(lead.status).toBe("rejected");
    });

    it("updates lead status to email_approved when email is approved", () => {
      updateEmail(emailId, { status: "approved" });

      const lead = testSqlite
        .prepare("SELECT status FROM leads WHERE id = ?")
        .get(leadId) as { status: string };
      expect(lead.status).toBe("email_approved");
    });

    it("throws NotFoundError for non-existent email", () => {
      expect(() => updateEmail(9999, { subject: "Nope" })).toThrow(
        NotFoundError
      );
    });
  });
});
