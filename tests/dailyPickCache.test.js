/**
 * Unit tests for the cache-key + TTL helpers in daily-pick.js (PR #145).
 *
 * The cache eliminates redundant Claude calls when (date, pinnedWatch,
 * weather signature, wardrobe state, history state) haven't meaningfully
 * changed. Same inputs = same cache key = same cached pick.
 *
 * These are pure-function tests for the cache machinery. The integration
 * (request → fetch → cache check → Claude call → cache write) is exercised
 * via the existing dailyPick.test.js suite.
 */
import { describe, test, expect } from "vitest";
import { computeCacheKey, cacheTtlMs } from "../netlify/functions/daily-pick.js";

const today = (() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date()))();
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);
})();

const baseInput = {
  date: today,
  pinnedWatchId: "blackbay",
  weather: { tempMorning: 12, tempMidday: 18, tempEvening: 14 },
  garments: [
    { id: "g1", created_at: "2026-04-01T00:00:00Z" },
    { id: "g2", created_at: "2026-05-01T00:00:00Z" },
  ],
  history: [
    { date: "2026-05-03", payload: {} },
    { date: "2026-05-02", payload: {} },
  ],
};

describe("computeCacheKey", () => {
  test("identical inputs produce identical keys", () => {
    expect(computeCacheKey(baseInput)).toBe(computeCacheKey(baseInput));
  });

  test("different date → different key", () => {
    const k1 = computeCacheKey(baseInput);
    const k2 = computeCacheKey({ ...baseInput, date: tomorrow });
    expect(k1).not.toBe(k2);
  });

  test("different pinnedWatchId → different key", () => {
    const k1 = computeCacheKey(baseInput);
    const k2 = computeCacheKey({ ...baseInput, pinnedWatchId: "rikka" });
    expect(k1).not.toBe(k2);
    // pinnedWatchId should appear in the key for grep-debuggability
    expect(k2).toContain("rikka");
  });

  test("null pinnedWatchId becomes 'open' in key", () => {
    const k = computeCacheKey({ ...baseInput, pinnedWatchId: null });
    expect(k).toContain(":open:");
  });

  test("weather rounding: sub-degree variations within same rounded integer produce same key", () => {
    // 17.1 and 17.4 both round to 17; 17.6 and 17.9 both round to 18.
    // Math.round flips at .5 — boundary is unavoidable but the cache is
    // robust to weather-API returning slightly different decimals each call.
    const a = computeCacheKey({ ...baseInput, weather: { tempMorning: 17.1, tempMidday: 18, tempEvening: 14 } });
    const b = computeCacheKey({ ...baseInput, weather: { tempMorning: 17.4, tempMidday: 18, tempEvening: 14 } });
    expect(a).toBe(b);
    const c = computeCacheKey({ ...baseInput, weather: { tempMorning: 17.6, tempMidday: 18, tempEvening: 14 } });
    const d = computeCacheKey({ ...baseInput, weather: { tempMorning: 17.9, tempMidday: 18, tempEvening: 14 } });
    expect(c).toBe(d);
    // a/b round to 17, c/d round to 18 → a !== c (different rounded value)
    expect(a).not.toBe(c);
  });

  test("weather difference of 1°C → different key", () => {
    const a = computeCacheKey({ ...baseInput, weather: { tempMorning: 12, tempMidday: 18, tempEvening: 14 } });
    const b = computeCacheKey({ ...baseInput, weather: { tempMorning: 13, tempMidday: 18, tempEvening: 14 } });
    expect(a).not.toBe(b);
  });

  test("missing weather doesn't crash, produces 'nw' marker", () => {
    const k = computeCacheKey({ ...baseInput, weather: null });
    expect(k).toContain("nw");
  });

  test("adding a garment → different key (wardrobe state changed)", () => {
    const k1 = computeCacheKey(baseInput);
    const k2 = computeCacheKey({
      ...baseInput,
      garments: [...baseInput.garments, { id: "g3", created_at: "2026-05-04T00:00:00Z" }],
    });
    expect(k1).not.toBe(k2);
  });

  test("logging a wear → different key (history state changed)", () => {
    const k1 = computeCacheKey(baseInput);
    const k2 = computeCacheKey({
      ...baseInput,
      history: [{ date: "2026-05-04", payload: {} }, ...baseInput.history],
    });
    expect(k1).not.toBe(k2);
  });

  test("key is reasonable length (< 200 chars) and prefixed for grep", () => {
    const k = computeCacheKey(baseInput);
    expect(k.length).toBeLessThan(200);
    expect(k).toMatch(/^daily_pick_cache:/);
  });
});

describe("cacheTtlMs", () => {
  test("today gets 4-hour TTL", () => {
    expect(cacheTtlMs(today)).toBe(4 * 60 * 60 * 1000);
  });

  test("tomorrow gets 24-hour TTL (forecast doesn't change minute-by-minute)", () => {
    expect(cacheTtlMs(tomorrow)).toBe(24 * 60 * 60 * 1000);
  });

  test("any past or future date that isn't today gets the longer TTL", () => {
    expect(cacheTtlMs("2026-01-15")).toBe(24 * 60 * 60 * 1000);
    expect(cacheTtlMs("2030-12-31")).toBe(24 * 60 * 60 * 1000);
  });
});
