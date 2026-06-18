import { vi, describe, it, expect, beforeEach } from "vitest";

// Real getSetting backed by the in-memory test settings table, so the schedule
// reads the same window/flags a deployment would.
vi.mock("@/db", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return {
    db: testDb,
    getSetting: (key: string) => {
      const row = testSqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setSetting: (key: string, value: string) => {
      testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    },
  };
});

vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

import { testSqlite } from "@/test/test-db";
import { computeScheduledFor } from "@/lib/cron/send-schedule";

function set(key: string, value: string) {
  testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

// Deterministic local-time date on a given day-of-week (0=Sun..6=Sat) at `hour`.
function onDow(dow: number, hour: number): Date {
  const d = new Date(2026, 5, 1, hour, 0, 0, 0); // anchor: June 2026
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

const lo = () => 0;        // earliest slot in the window
const hi = () => 0.999999; // latest slot in the window

describe("computeScheduledFor", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM settings");
  });

  it("defaults to the next weekday inside the 10-12 window", () => {
    const now = onDow(2, 15); // Tuesday 15:00
    for (const rng of [lo, hi, Math.random]) {
      const d = new Date(computeScheduledFor(now, rng));
      expect(d.getDay()).toBe(3);                       // Wednesday (next day)
      expect(d.getHours()).toBeGreaterThanOrEqual(10);
      expect(d.getHours()).toBeLessThan(12);
      expect(d.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("keeps the latest slot inside the window (tail buffer before close)", () => {
    const now = onDow(2, 9);
    const d = new Date(computeScheduledFor(now, hi));
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBeLessThanOrEqual(50); // ~10 min before noon
  });

  it("honours a custom window", () => {
    set("send_window_start", "9");
    set("send_window_end", "17");
    const now = onDow(2, 8);
    for (const rng of [lo, hi]) {
      const d = new Date(computeScheduledFor(now, rng));
      expect(d.getHours()).toBeGreaterThanOrEqual(9);
      expect(d.getHours()).toBeLessThan(17);
    }
  });

  it("skips weekends: a Friday approval rolls to Monday", () => {
    const now = onDow(5, 15); // Friday
    expect(now.getDay()).toBe(5);
    const d = new Date(computeScheduledFor(now, lo));
    expect(d.getDay()).toBe(1); // Monday
  });

  it("allows weekends when skip is turned off", () => {
    set("send_skip_weekends", "false");
    const now = onDow(5, 15); // Friday
    const d = new Date(computeScheduledFor(now, lo));
    expect(d.getDay()).toBe(6); // Saturday (next day)
  });

  describe("soonest mode (send_next_day = false)", () => {
    beforeEach(() => set("send_next_day", "false"));

    it("stays today when the window has not passed yet", () => {
      const now = onDow(2, 8); // Tuesday 08:00, before the window
      const d = new Date(computeScheduledFor(now, lo));
      expect(d.getDate()).toBe(now.getDate());
      expect(d.getHours()).toBeGreaterThanOrEqual(10);
    });

    it("rolls to tomorrow when today's window already closed", () => {
      const now = onDow(2, 20); // Tuesday 20:00, after the window
      const d = new Date(computeScheduledFor(now, lo));
      expect(d.getDate()).toBe(now.getDate() + 1);
    });
  });

  it("returns an ISO-UTC instant strictly in the future (due-gating works)", () => {
    const now = onDow(2, 15);
    const iso = computeScheduledFor(now, Math.random);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(iso > now.toISOString()).toBe(true);
  });
});
