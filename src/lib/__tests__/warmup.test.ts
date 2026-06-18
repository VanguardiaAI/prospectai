import { vi, describe, it, expect, beforeEach } from "vitest";

// Real getSetting/setSetting backed by the in-memory test DB so warm-up state
// actually round-trips through the settings table.
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

import { testSqlite } from "@/test/test-db";
import {
  getEffectiveDailyLimit,
  getWhatsAppDailyLimit,
  incrementWarmupDay,
  incrementWhatsAppWarmupDay,
  clampLimitSetting,
  ABSOLUTE_MAX_EMAIL_PER_DAY,
  ABSOLUTE_MAX_WA_PER_DAY,
} from "@/lib/cron/warmup";

function set(key: string, value: string) {
  testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}
function get(key: string): string | null {
  const row = testSqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
const today = new Date().toISOString().split("T")[0];

describe("warmup & send limits", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM settings");
    testSqlite.exec("DELETE FROM sending_domains");
  });

  describe("clampLimitSetting (write-time hard clamp)", () => {
    it("clamps an over-ceiling email limit down to the absolute max", () => {
      expect(clampLimitSetting("global_daily_limit", "100000")).toBe(String(ABSOLUTE_MAX_EMAIL_PER_DAY));
      expect(clampLimitSetting("warmup_max_limit", "9999")).toBe(String(ABSOLUTE_MAX_EMAIL_PER_DAY));
    });
    it("clamps an over-ceiling WhatsApp limit down to the absolute max", () => {
      expect(clampLimitSetting("wa_daily_limit", "5000")).toBe(String(ABSOLUTE_MAX_WA_PER_DAY));
    });
    it("leaves in-range values untouched", () => {
      expect(clampLimitSetting("global_daily_limit", "50")).toBe("50");
      expect(clampLimitSetting("wa_daily_limit", "20")).toBe("20");
    });
    it("floors negatives at 0 (paused) and passes non-limit / non-numeric keys through", () => {
      expect(clampLimitSetting("global_daily_limit", "-10")).toBe("0");
      expect(clampLimitSetting("agency_name", "999999")).toBe("999999");
      expect(clampLimitSetting("global_daily_limit", "abc")).toBe("abc");
    });
  });

  describe("getEffectiveDailyLimit (read-time clamp + ramp)", () => {
    it("never exceeds the absolute ceiling even if the stored value is absurd", () => {
      set("warmup_enabled", "false");
      set("global_daily_limit", "100000"); // e.g. a typo or a bad MCP write
      expect(getEffectiveDailyLimit()).toBe(ABSOLUTE_MAX_EMAIL_PER_DAY);
    });

    it("honours the configured steady-state cap when warm-up is off", () => {
      set("warmup_enabled", "false");
      set("global_daily_limit", "50");
      expect(getEffectiveDailyLimit()).toBe(50);
    });

    it("applies the warm-up ramp capped by the global limit", () => {
      set("warmup_enabled", "true");
      set("global_daily_limit", "50");
      set("warmup_start_limit", "5");
      set("warmup_increment", "5");
      set("warmup_max_limit", "50");
      set("warmup_day", "1");
      expect(getEffectiveDailyLimit()).toBe(5); // day 1
      set("warmup_day", "3");
      expect(getEffectiveDailyLimit()).toBe(15); // 5 + 2*5
      set("warmup_day", "100");
      expect(getEffectiveDailyLimit()).toBe(50); // capped at max, never above global
    });
  });

  describe("getWhatsAppDailyLimit (ramp + clamp)", () => {
    it("ramps gently and respects the cap", () => {
      set("wa_warmup_enabled", "true");
      set("wa_daily_limit", "20");
      set("wa_warmup_start_limit", "5");
      set("wa_warmup_increment", "3");
      set("wa_warmup_max_limit", "20");
      set("wa_warmup_day", "1");
      expect(getWhatsAppDailyLimit()).toBe(5);
      set("wa_warmup_day", "3");
      expect(getWhatsAppDailyLimit()).toBe(11); // 5 + 2*3
      set("wa_warmup_day", "100");
      expect(getWhatsAppDailyLimit()).toBe(20); // capped
    });

    it("clamps an absurd WhatsApp cap to the absolute ceiling", () => {
      set("wa_warmup_enabled", "false");
      set("wa_daily_limit", "9999");
      expect(getWhatsAppDailyLimit()).toBe(ABSOLUTE_MAX_WA_PER_DAY);
    });

    it("falls back to the cap when warm-up is disabled", () => {
      set("wa_warmup_enabled", "false");
      set("wa_daily_limit", "20");
      expect(getWhatsAppDailyLimit()).toBe(20);
    });
  });

  describe("incrementWarmupDay (advance once per active day, no mid-day jump)", () => {
    beforeEach(() => {
      set("warmup_enabled", "true");
      set("warmup_start_limit", "5");
      set("warmup_increment", "5");
      set("warmup_max_limit", "50");
    });

    it("claims the first active day without bumping (it is already day 1)", () => {
      set("warmup_day", "1"); // _warmup_last_increment is absent
      incrementWarmupDay();
      expect(get("warmup_day")).toBe("1");
      expect(get("_warmup_last_increment")).toBe(today);
    });

    it("is a no-op when already advanced today (limit stays stable across ticks)", () => {
      set("warmup_day", "3");
      set("_warmup_last_increment", today);
      incrementWarmupDay();
      expect(get("warmup_day")).toBe("3");
    });

    it("advances by one on a new calendar day", () => {
      set("warmup_day", "1");
      set("_warmup_last_increment", "2020-01-01");
      incrementWarmupDay();
      expect(get("warmup_day")).toBe("2");
      expect(get("_warmup_last_increment")).toBe(today);
    });

    it("stops advancing once the ramp reaches its max", () => {
      set("warmup_day", "10"); // 5 + 9*5 = 50 = max
      set("_warmup_last_increment", "2020-01-01");
      incrementWarmupDay();
      expect(get("warmup_day")).toBe("10");
    });

    it("does nothing when warm-up is disabled", () => {
      set("warmup_enabled", "false");
      set("warmup_day", "1");
      set("_warmup_last_increment", "2020-01-01");
      incrementWarmupDay();
      expect(get("warmup_day")).toBe("1");
      expect(get("_warmup_last_increment")).toBe("2020-01-01");
    });
  });

  describe("incrementWhatsAppWarmupDay", () => {
    beforeEach(() => {
      set("wa_warmup_enabled", "true");
      set("wa_warmup_start_limit", "5");
      set("wa_warmup_increment", "3");
      set("wa_warmup_max_limit", "20");
    });

    it("claims day 1 then advances on a new day", () => {
      set("wa_warmup_day", "1");
      incrementWhatsAppWarmupDay();
      expect(get("wa_warmup_day")).toBe("1"); // claimed, not bumped
      set("_wa_warmup_last_increment", "2020-01-01");
      incrementWhatsAppWarmupDay();
      expect(get("wa_warmup_day")).toBe("2");
    });
  });
});
