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
import {
  whatsappIsFallback,
  whatsappFallbackDecision,
  leadHasReplied,
  cancelPendingOutreachOnReply,
  isOlderThanDays,
} from "@/lib/outreach-policy";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function seedCampaign(channels = "email,whatsapp"): number {
  const r = testSqlite
    .prepare("INSERT INTO campaigns (name, channels, status) VALUES (?, ?, 'active')")
    .run("C", channels);
  return Number(r.lastInsertRowid);
}

function seedLead(opts: { campaignId?: number | null; email?: string | null; phone?: string | null; status?: string } = {}): number {
  const r = testSqlite
    .prepare("INSERT INTO leads (campaign_id, name, email, phone, status) VALUES (?, ?, ?, ?, ?)")
    .run(opts.campaignId ?? null, "Lead", opts.email ?? null, opts.phone ?? null, opts.status ?? "analyzed");
  return Number(r.lastInsertRowid);
}

function seedEmail(leadId: number, status: string, sentAt: string | null = null): number {
  const r = testSqlite
    .prepare("INSERT INTO emails (lead_id, to_email, subject, body_html, body_text, status, sent_at) VALUES (?, 'a@b.com', 's', '<p>x</p>', 'x', ?, ?)")
    .run(leadId, status, sentAt);
  return Number(r.lastInsertRowid);
}

function seedWA(leadId: number, status: string): number {
  const r = testSqlite
    .prepare("INSERT INTO whatsapp_messages (lead_id, to_phone, body, status) VALUES (?, '+34123', 'hi', ?)")
    .run(leadId, status);
  return Number(r.lastInsertRowid);
}

function seedReply(leadId: number): void {
  testSqlite
    .prepare("INSERT INTO replies (lead_id, channel, from_address, body) VALUES (?, 'email', 'a@b.com', 'hola')")
    .run(leadId);
}

function waStatus(id: number): string {
  return (testSqlite.prepare("SELECT status FROM whatsapp_messages WHERE id = ?").get(id) as { status: string }).status;
}
function emailStatus(id: number): string {
  return (testSqlite.prepare("SELECT status FROM emails WHERE id = ?").get(id) as { status: string }).status;
}

describe("outreach-policy", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM replies");
    testSqlite.exec("DELETE FROM whatsapp_messages");
    testSqlite.exec("DELETE FROM emails");
    testSqlite.exec("DELETE FROM leads");
    testSqlite.exec("DELETE FROM campaigns");
  });

  describe("isOlderThanDays", () => {
    it("handles ISO and SQLite datetime formats, and null", () => {
      expect(isOlderThanDays(daysAgo(5), 3)).toBe(true);
      expect(isOlderThanDays(daysAgo(1), 3)).toBe(false);
      expect(isOlderThanDays("2000-01-01 00:00:00", 3)).toBe(true); // SQLite UTC format
      expect(isOlderThanDays(null, 3)).toBe(false);
    });
  });

  describe("whatsappIsFallback", () => {
    it("is true when the campaign uses email and the lead has an email", () => {
      const c = seedCampaign("email,whatsapp");
      const l = seedLead({ campaignId: c, email: "a@b.com", phone: "+34123" });
      expect(whatsappIsFallback(l)).toBe(true);
    });

    it("is false for a WhatsApp-only campaign (WhatsApp is the primary)", () => {
      const c = seedCampaign("whatsapp");
      const l = seedLead({ campaignId: c, email: "a@b.com", phone: "+34123" });
      expect(whatsappIsFallback(l)).toBe(false);
    });

    it("is false when the lead has no email address", () => {
      const c = seedCampaign("email,whatsapp");
      const l = seedLead({ campaignId: c, email: null, phone: "+34123" });
      expect(whatsappIsFallback(l)).toBe(false);
    });

    it("defaults to email-first for a lead with no campaign", () => {
      const l = seedLead({ campaignId: null, email: "a@b.com", phone: "+34123" });
      expect(whatsappIsFallback(l)).toBe(true);
    });
  });

  describe("whatsappFallbackDecision", () => {
    it("waits while the primary email is still a draft or approved", () => {
      const l = seedLead({ email: "a@b.com" });
      seedEmail(l, "draft");
      expect(whatsappFallbackDecision(l)).toBe("wait");
    });

    it("waits while the email was sent within the delay window", () => {
      const l = seedLead({ email: "a@b.com" });
      seedEmail(l, "sent", daysAgo(1));
      expect(whatsappFallbackDecision(l)).toBe("wait");
    });

    it("sends once the email was sent before the delay window", () => {
      const l = seedLead({ email: "a@b.com" });
      seedEmail(l, "sent", daysAgo(5));
      expect(whatsappFallbackDecision(l)).toBe("send");
    });

    it("sends when the primary email is exhausted (failed/rejected)", () => {
      const l1 = seedLead({ email: "a@b.com" });
      seedEmail(l1, "failed");
      expect(whatsappFallbackDecision(l1)).toBe("send");

      const l2 = seedLead({ email: "a@b.com" });
      seedEmail(l2, "rejected");
      expect(whatsappFallbackDecision(l2)).toBe("send");
    });

    it("cancels when the lead has replied", () => {
      const l = seedLead({ email: "a@b.com" });
      seedEmail(l, "sent", daysAgo(5));
      seedReply(l);
      expect(whatsappFallbackDecision(l)).toBe("cancel");
    });

    it("falls back after the delay when no email was ever produced", () => {
      const l = seedLead({ email: "a@b.com" });
      expect(whatsappFallbackDecision(l, daysAgo(5))).toBe("send");
      expect(whatsappFallbackDecision(l, daysAgo(1))).toBe("wait");
    });
  });

  describe("leadHasReplied", () => {
    it("is false with no reply and not-replied status", () => {
      const l = seedLead({ status: "email_sent" });
      expect(leadHasReplied(l)).toBe(false);
    });

    it("is true when a reply row exists", () => {
      const l = seedLead({ status: "email_sent" });
      seedReply(l);
      expect(leadHasReplied(l)).toBe(true);
    });

    it("is true when the lead status is 'replied'", () => {
      const l = seedLead({ status: "replied" });
      expect(leadHasReplied(l)).toBe(true);
    });
  });

  describe("cancelPendingOutreachOnReply", () => {
    it("rejects held/draft/approved messages but leaves sent ones", () => {
      const l = seedLead({ email: "a@b.com" });
      const heldWa = seedWA(l, "held");
      const draftEmail = seedEmail(l, "draft");
      const sentEmail = seedEmail(l, "sent", daysAgo(1));

      cancelPendingOutreachOnReply(l);

      expect(waStatus(heldWa)).toBe("rejected");
      expect(emailStatus(draftEmail)).toBe("rejected");
      expect(emailStatus(sentEmail)).toBe("sent"); // already delivered → untouched
    });
  });
});
