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
  isRealEmail,
  normalizePhone,
  domainOf,
  findPriorContacts,
  wasCompanyContacted,
} from "@/lib/contact-history";

function seedCampaign(strategy = "web_design", name = "Camp"): number {
  const r = testSqlite
    .prepare("INSERT INTO campaigns (name, strategy, channels, status) VALUES (?, ?, 'email,whatsapp', 'active')")
    .run(name, strategy);
  return Number(r.lastInsertRowid);
}
function seedLead(o: { campaignId?: number; email?: string | null; phone?: string | null; website?: string | null }): number {
  const r = testSqlite
    .prepare("INSERT INTO leads (campaign_id, name, email, phone, website, status) VALUES (?, 'L', ?, ?, ?, 'analyzed')")
    .run(o.campaignId ?? null, o.email ?? null, o.phone ?? null, o.website ?? null);
  return Number(r.lastInsertRowid);
}
function seedEmail(leadId: number, campaignId: number, status: string, sentAt: string | null = null): void {
  testSqlite
    .prepare("INSERT INTO emails (lead_id, campaign_id, to_email, subject, body_html, body_text, status, sent_at) VALUES (?, ?, 'x@x.com','s','<p>x</p>','x', ?, ?)")
    .run(leadId, campaignId, status, sentAt);
}
function seedWA(leadId: number, campaignId: number, status: string): void {
  testSqlite
    .prepare("INSERT INTO whatsapp_messages (lead_id, campaign_id, to_phone, body, status) VALUES (?, ?, '+34123','hi', ?)")
    .run(leadId, campaignId, status);
}

describe("contact-history", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM whatsapp_messages");
    testSqlite.exec("DELETE FROM emails");
    testSqlite.exec("DELETE FROM leads");
    testSqlite.exec("DELETE FROM campaigns");
  });

  describe("helpers", () => {
    it("isRealEmail rejects junk/file-like addresses", () => {
      expect(isRealEmail("info@dental.mx")).toBe(true);
      expect(isRealEmail("logo-degradado@2x.png")).toBe(false);
      expect(isRealEmail("close_side_menu@2x.png")).toBe(false);
      expect(isRealEmail("nope")).toBe(false);
      expect(isRealEmail(null)).toBe(false);
    });
    it("normalizePhone keeps the last 10 digits", () => {
      expect(normalizePhone("+52 442 241 0284")).toBe("4422410284");
      expect(normalizePhone("(442) 241-0284")).toBe("4422410284");
      expect(normalizePhone("123")).toBeNull();
    });
    it("domainOf strips scheme/www/path", () => {
      expect(domainOf("https://www.dental.mx/contacto?x=1")).toBe("dental.mx");
      expect(domainOf("dental.mx")).toBe("dental.mx");
      expect(domainOf(null)).toBeNull();
    });
  });

  describe("findPriorContacts / wasCompanyContacted", () => {
    it("detects the same company across campaigns by phone (prior SENT email)", () => {
      const c1 = seedCampaign("web_design", "Diseño web");
      const c2 = seedCampaign("seo_visibility", "SEO");
      const a = seedLead({ campaignId: c1, email: "a@dental.mx", phone: "+52 442 241 0284", website: "https://dental.mx" });
      seedEmail(a, c1, "sent", "2026-06-10T10:00:00.000Z");
      // Same phone, different (junk) email + different site.
      const b = seedLead({ campaignId: c2, email: "logo@2x.png", phone: "442-241-0284", website: "https://other.mx" });

      expect(wasCompanyContacted(b)).toBe(true);
      const prior = findPriorContacts(b, { onlySent: true });
      expect(prior).toHaveLength(1);
      expect(prior[0]).toMatchObject({ channel: "email", campaignName: "Diseño web", strategy: "web_design", status: "sent", matchedOn: "phone" });
    });

    it("detects by shared website domain", () => {
      const c1 = seedCampaign();
      const a = seedLead({ campaignId: c1, phone: null, website: "https://dental.mx" });
      seedEmail(a, c1, "sent", "2026-06-10T10:00:00.000Z");
      const b = seedLead({ campaignId: c1, phone: null, website: "http://www.dental.mx/inicio" });
      expect(wasCompanyContacted(b)).toBe(true);
      expect(findPriorContacts(b, { onlySent: true })[0].matchedOn).toBe("domain");
    });

    it("does NOT match on junk emails alone", () => {
      const c1 = seedCampaign();
      const a = seedLead({ campaignId: c1, email: "logo@2x.png", phone: null, website: "https://a.mx" });
      seedEmail(a, c1, "sent", "2026-06-10T10:00:00.000Z");
      const b = seedLead({ campaignId: c1, email: "logo@2x.png", phone: null, website: "https://b.mx" });
      expect(wasCompanyContacted(b)).toBe(false);
    });

    it("only counts SENT for the guard; pending shows in the full list", () => {
      const c1 = seedCampaign();
      const a = seedLead({ campaignId: c1, phone: "4422410284", website: "https://a.mx" });
      seedWA(a, c1, "approved"); // pending, not sent
      const b = seedLead({ campaignId: c1, phone: "4422410284", website: "https://b.mx" });

      expect(wasCompanyContacted(b)).toBe(false);              // nothing delivered yet
      expect(findPriorContacts(b)).toHaveLength(1);            // but the overlap is visible
      expect(findPriorContacts(b)[0].status).toBe("approved");
    });

    it("returns nothing for a company with no siblings", () => {
      const c1 = seedCampaign();
      const a = seedLead({ campaignId: c1, email: "solo@unique.mx", phone: "5550001111", website: "https://unique.mx" });
      seedEmail(a, c1, "sent", "2026-06-10T10:00:00.000Z");
      expect(wasCompanyContacted(a)).toBe(false); // excludes its own messages
    });
  });
});
