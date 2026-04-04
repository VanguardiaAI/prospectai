import { db, getSetting, setSetting } from "@/db";
import { sendingDomains } from "@/db/schema";
import { ne } from "drizzle-orm";

export function getEffectiveDailyLimit(): number {
  const globalLimit = parseInt(getSetting("global_daily_limit") || "50");

  const activeDomains = db.select().from(sendingDomains)
    .where(ne(sendingDomains.status, "paused"))
    .all();

  if (activeDomains.length > 0) {
    let total = 0;
    for (const d of activeDomains) {
      const day = d.warmupDay && d.warmupDay > 0 ? d.warmupDay : 1;
      total += Math.min(d.warmupStartLimit + (day - 1) * d.warmupIncrement, d.dailyLimit);
    }
    return Math.min(total, globalLimit);
  }

  const warmupEnabled = getSetting("warmup_enabled") === "true";
  if (!warmupEnabled) return globalLimit;

  const warmupDay = parseInt(getSetting("warmup_day") || "1");
  const startLimit = parseInt(getSetting("warmup_start_limit") || "5");
  const increment = parseInt(getSetting("warmup_increment") || "5");
  const maxLimit = parseInt(getSetting("warmup_max_limit") || "50");

  const effectiveLimit = Math.min(startLimit + (warmupDay - 1) * increment, maxLimit);
  return Math.min(effectiveLimit, globalLimit);
}

export function isWithinSendWindow(): boolean {
  const startHour = parseInt(getSetting("send_window_start") || "9");
  const endHour = parseInt(getSetting("send_window_end") || "18");
  const now = new Date();
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

export function incrementWarmupDay(): void {
  if (getSetting("warmup_enabled") !== "true") return;
  const currentDay = parseInt(getSetting("warmup_day") || "1");
  const maxLimit = parseInt(getSetting("warmup_max_limit") || "50");
  const startLimit = parseInt(getSetting("warmup_start_limit") || "5");
  const increment = parseInt(getSetting("warmup_increment") || "5");

  const currentLimit = startLimit + (currentDay - 1) * increment;
  if (currentLimit < maxLimit) {
    const lastIncrement = getSetting("_warmup_last_increment");
    const today = new Date().toISOString().split("T")[0];
    if (lastIncrement !== today) {
      setSetting("warmup_day", String(currentDay + 1));
      setSetting("_warmup_last_increment", today);
    }
  }
}
