import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return {
    db: testDb,
    getSetting: (key: string) => {
      const row = testSqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setSetting: (key: string, value: string) => {
      testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
    },
  };
});

vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

// Avoid loading whatsapp-web.js; control the connected flag per test.
vi.mock("@/lib/whatsapp-client", () => ({ isWhatsAppReady: vi.fn(() => false) }));

import { testSqlite } from "@/test/test-db";
import { isWhatsAppReady } from "@/lib/whatsapp-client";
import { getSendingQuota } from "@/services/analytics.service";
import { ABSOLUTE_MAX_EMAIL_PER_DAY } from "@/lib/cron/warmup";

function set(key: string, value: string) {
  testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

let leadId: number;
function seedLead(): number {
  const r = testSqlite.prepare("INSERT INTO leads (name, status) VALUES ('L', 'analyzed')").run();
  return Number(r.lastInsertRowid);
}
function seedSentEmails(n: number) {
  const now = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    testSqlite.prepare(
      "INSERT INTO emails (lead_id, to_email, subject, body_html, body_text, status, sent_at) VALUES (?, 'a@b.com', 's', '<p>x</p>', 'x', 'sent', ?)",
    ).run(leadId, now);
  }
}

describe("getSendingQuota", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM settings");
    testSqlite.exec("DELETE FROM emails");
    testSqlite.exec("DELETE FROM whatsapp_messages");
    testSqlite.exec("DELETE FROM workana_proposals");
    testSqlite.exec("DELETE FROM sending_domains");
    testSqlite.exec("DELETE FROM leads");
    leadId = seedLead();
    (isWhatsAppReady as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    // Wide-open window so `within` is deterministic regardless of clock.
    set("send_window_start", "0");
    set("send_window_end", "24");
  });

  it("computes email remaining = limit - sent today", () => {
    set("warmup_enabled", "false");
    set("global_daily_limit", "50");
    seedSentEmails(12);
    const q = getSendingQuota();
    expect(q.email.limit).toBe(50);
    expect(q.email.sent).toBe(12);
    expect(q.email.remaining).toBe(38);
    expect(q.window.within).toBe(true);
  });

  it("never reports a limit above the absolute ceiling", () => {
    set("warmup_enabled", "false");
    set("global_daily_limit", "100000");
    const q = getSendingQuota();
    expect(q.email.limit).toBe(ABSOLUTE_MAX_EMAIL_PER_DAY);
  });

  it("exposes the email warm-up snapshot while ramping", () => {
    set("warmup_enabled", "true");
    set("global_daily_limit", "50");
    set("warmup_start_limit", "5");
    set("warmup_increment", "5");
    set("warmup_max_limit", "50");
    set("warmup_day", "3");
    const q = getSendingQuota();
    expect(q.email.limit).toBe(15); // 5 + 2*5
    expect(q.email.warmup).toEqual({ day: 3, max: 50, complete: false });
  });

  it("reflects the WhatsApp warm-up ramp and connection state", () => {
    set("wa_warmup_enabled", "true");
    set("wa_daily_limit", "20");
    set("wa_warmup_start_limit", "5");
    set("wa_warmup_increment", "3");
    set("wa_warmup_max_limit", "20");
    set("wa_warmup_day", "1");
    (isWhatsAppReady as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(true);
    const q = getSendingQuota();
    expect(q.whatsapp.limit).toBe(5);
    expect(q.whatsapp.remaining).toBe(5);
    expect(q.whatsapp.connected).toBe(true);
  });

  it("omits Workana when the add-on is disabled", () => {
    set("workana_enabled", "false");
    expect(getSendingQuota().workana).toBeNull();
  });

  it("reports the weekly Workana budget when enabled", () => {
    set("workana_enabled", "true");
    set("workana_weekly_connections", "10");
    set("workana_allow_submit", "true");
    const now = new Date().toISOString();
    testSqlite.prepare("INSERT INTO workana_proposals (project_id, cover_letter, status, submitted_at) VALUES (1, 'x', 'submitted', ?)").run(now);
    testSqlite.prepare("INSERT INTO workana_proposals (project_id, cover_letter, status) VALUES (1, 'x', 'draft')").run();
    const q = getSendingQuota();
    expect(q.workana).toEqual({
      weeklyLimit: 10,
      submitted: 1,
      remaining: 9,
      pending: 1,
      allowSubmit: true,
    });
  });
});
