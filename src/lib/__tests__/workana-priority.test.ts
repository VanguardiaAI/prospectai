import { describe, it, expect } from "vitest";
import { parseRelativeTime, recencyBonus, priorityScore, WORKANA_DEFAULTS } from "@/lib/workana/priority";

// Fixed reference instant so the relative-time math is deterministic.
const NOW = Date.parse("2026-06-18T12:00:00.000Z");
const HOUR = 3_600_000;

describe("parseRelativeTime", () => {
  it("parses Spanish hours/minutes/days", () => {
    expect(parseRelativeTime("Hace 2 horas", NOW)).toBe(NOW - 2 * HOUR);
    expect(parseRelativeTime("hace 30 minutos", NOW)).toBe(NOW - 30 * 60_000);
    expect(parseRelativeTime("Hace 3 días", NOW)).toBe(NOW - 3 * 24 * HOUR);
  });

  it("parses 'ayer' and Portuguese/English variants", () => {
    expect(parseRelativeTime("ayer", NOW)).toBe(NOW - 24 * HOUR);
    expect(parseRelativeTime("há 2 dias", NOW)).toBe(NOW - 2 * 24 * HOUR);
    expect(parseRelativeTime("2 days ago", NOW)).toBe(NOW - 2 * 24 * HOUR);
    expect(parseRelativeTime("5 hours ago", NOW)).toBe(NOW - 5 * HOUR);
  });

  it("returns null for unrecognized / empty text", () => {
    expect(parseRelativeTime(null, NOW)).toBeNull();
    expect(parseRelativeTime("", NOW)).toBeNull();
    expect(parseRelativeTime("Proyecto de desarrollo web", NOW)).toBeNull();
  });
});

describe("recencyBonus", () => {
  it("decreases monotonically with age and bottoms out at 0", () => {
    expect(recencyBonus(1)).toBe(20);
    expect(recencyBonus(13)).toBe(14);
    expect(recencyBonus(30)).toBe(8);
    expect(recencyBonus(60)).toBe(3);
    expect(recencyBonus(100)).toBe(0);
  });

  it("gives a small neutral bonus when age is unknown/invalid", () => {
    expect(recencyBonus(NaN)).toBe(6);
    expect(recencyBonus(-5)).toBe(6);
  });
});

describe("priorityScore", () => {
  const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

  it("ranks a fresher project above an older one at equal fit", () => {
    const fresh = priorityScore({ fitScore: 70, publishedAt: iso(2) }, NOW);
    const old = priorityScore({ fitScore: 70, publishedAt: iso(100) }, NOW);
    expect(fresh).toBeGreaterThan(old);
  });

  it("ranks higher fit above lower fit at equal recency", () => {
    const hi = priorityScore({ fitScore: 90, publishedAt: iso(5) }, NOW);
    const lo = priorityScore({ fitScore: 60, publishedAt: iso(5) }, NOW);
    expect(hi).toBeGreaterThan(lo);
  });

  it("keeps a recent-but-not-newest strong match ahead of a fresh weak one", () => {
    // User requirement: don't discard recent offers from previous days that fit well.
    const recentStrong = priorityScore({ fitScore: 92, publishedAt: iso(40) }, NOW); // ~2 days, great fit
    const freshWeak = priorityScore({ fitScore: 55, publishedAt: iso(1) }, NOW); // brand new, weak fit
    expect(recentStrong).toBeGreaterThan(freshWeak);
  });

  it("uses confidence only as a light tiebreaker", () => {
    const a = priorityScore({ fitScore: 80, publishedAt: iso(5), confidence: 90 }, NOW);
    const b = priorityScore({ fitScore: 80, publishedAt: iso(5), confidence: 40 }, NOW);
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBeLessThan(6); // confidence weight is small (0.1x)
  });
});

describe("WORKANA_DEFAULTS", () => {
  it("encodes the Professional-plan limits", () => {
    expect(WORKANA_DEFAULTS.weeklyConnections).toBe(17);
    expect(WORKANA_DEFAULTS.minSendIntervalMinutes).toBe(20);
  });
});
