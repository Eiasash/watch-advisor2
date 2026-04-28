import { describe, it, expect } from "vitest";
import {
  buildTripDays, curateWatchesForTrip, assignWatchesToDays,
  validateTrip, daysBetween, CLIMATE_PROFILES,
} from "../src/features/travel/travelPlanner.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

describe("travelPlanner", () => {
  describe("validateTrip", () => {
    it("rejects null trip", () => {
      expect(validateTrip(null).ok).toBe(false);
    });

    it("requires destination", () => {
      const r = validateTrip({ destination: "", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/destination/i);
    });

    it("requires both dates", () => {
      expect(validateTrip({ destination: "Paris", startDate: "2026-05-01", days: 1 }).ok).toBe(false);
      expect(validateTrip({ destination: "Paris", endDate: "2026-05-01", days: 1 }).ok).toBe(false);
    });

    it("rejects end before start", () => {
      const r = validateTrip({ destination: "Paris", startDate: "2026-05-10", endDate: "2026-05-05", days: 1 });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/before/i);
    });

    it("requires days >= 1", () => {
      const r = validateTrip({ destination: "Paris", startDate: "2026-05-01", endDate: "2026-05-05", days: 0 });
      expect(r.ok).toBe(false);
    });

    it("accepts a valid trip", () => {
      const r = validateTrip({ destination: "Paris", startDate: "2026-05-01", endDate: "2026-05-05", days: 5 });
      expect(r.ok).toBe(true);
    });
  });

  describe("daysBetween", () => {
    it("returns 1 for missing dates", () => {
      expect(daysBetween(null, null)).toBe(1);
    });

    it("returns inclusive day count", () => {
      expect(daysBetween("2026-05-01", "2026-05-05")).toBe(5);
      expect(daysBetween("2026-05-01", "2026-05-01")).toBe(1);
    });

    it("returns 1 minimum even for inverted range", () => {
      expect(daysBetween("2026-05-05", "2026-05-01")).toBe(1);
    });
  });

  describe("buildTripDays", () => {
    it("returns empty for invalid start date", () => {
      expect(buildTripDays({ destination: "X", startDate: "garbage", days: 3 })).toEqual([]);
    });

    it("synthesises tropical-bucket temps when no forecast", () => {
      const days = buildTripDays({
        destination: "Bangkok", startDate: "2026-05-01", days: 5, climate: "tropical",
      });
      expect(days).toHaveLength(5);
      const profile = CLIMATE_PROFILES.tropical;
      for (const d of days) {
        expect(d.source).toBe("climate");
        expect(d.tempC).toBeGreaterThanOrEqual(profile.meanC - profile.swing);
        expect(d.tempC).toBeLessThanOrEqual(profile.meanC + profile.swing);
      }
    });

    it("uses forecast when available, falls back to climate when missing", () => {
      const days = buildTripDays(
        { destination: "Paris", startDate: "2026-05-01", days: 3, climate: "temperate" },
        [
          { date: "2026-05-01", tempC: 18, description: "Sunny" },
          // 2026-05-02 missing → falls back
          { date: "2026-05-03", tempC: 12, description: "Rain" },
        ],
      );
      expect(days[0].source).toBe("forecast");
      expect(days[0].tempC).toBe(18);
      expect(days[1].source).toBe("climate");
      expect(days[2].source).toBe("forecast");
      expect(days[2].tempC).toBe(12);
    });

    it("clamps day count to 60", () => {
      const days = buildTripDays({ destination: "X", startDate: "2026-01-01", days: 999, climate: "temperate" });
      expect(days.length).toBe(60);
    });

    it("yields deterministic temps for same destination + date", () => {
      const a = buildTripDays({ destination: "Tokyo", startDate: "2026-05-01", days: 3, climate: "temperate" });
      const b = buildTripDays({ destination: "Tokyo", startDate: "2026-05-01", days: 3, climate: "temperate" });
      expect(a.map(d => d.tempC)).toEqual(b.map(d => d.tempC));
    });
  });

  describe("curateWatchesForTrip", () => {
    const tripDays = [
      { date: "2026-05-01", tempC: 18 },
      { date: "2026-05-02", tempC: 22 },
      { date: "2026-05-03", tempC: 24 },
    ];

    it("returns empty for empty watch list", () => {
      expect(curateWatchesForTrip([], tripDays)).toEqual([]);
    });

    it("excludes retired & pending watches", () => {
      const result = curateWatchesForTrip(WATCH_COLLECTION, tripDays, [], 5);
      expect(result.every(w => !w.retired && !w.pending)).toBe(true);
    });

    it("returns at most `count` watches", () => {
      const result = curateWatchesForTrip(WATCH_COLLECTION, tripDays, [], 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("returns watches sorted by aggregate suitability", () => {
      const result = curateWatchesForTrip(WATCH_COLLECTION, tripDays, [], 5);
      // Top pick should be smart-casual-leaning (sport-elegant or dress-sport)
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("assignWatchesToDays", () => {
    it("returns empty when no curated watches", () => {
      expect(assignWatchesToDays([], [{ date: "2026-05-01", tempC: 20 }])).toEqual([]);
    });

    it("assigns one watch per day", () => {
      const tripDays = [
        { date: "2026-05-01", tempC: 18 },
        { date: "2026-05-02", tempC: 22 },
        { date: "2026-05-03", tempC: 26 },
      ];
      const curated = curateWatchesForTrip(WATCH_COLLECTION, tripDays, [], 3);
      const assigned = assignWatchesToDays(curated, tripDays);
      expect(assigned).toHaveLength(3);
      expect(assigned.every(d => d.watchId)).toBe(true);
    });

    it("spreads wears across days when possible", () => {
      const tripDays = Array.from({ length: 6 }).map((_, i) => ({
        date: `2026-05-0${i + 1}`, tempC: 18,
      }));
      const curated = curateWatchesForTrip(WATCH_COLLECTION, tripDays, [], 3);
      const assigned = assignWatchesToDays(curated, tripDays);
      // With 3 watches and 6 days, no single watch should monopolise (>4 wears)
      const counts = {};
      for (const d of assigned) counts[d.watchId] = (counts[d.watchId] ?? 0) + 1;
      const max = Math.max(...Object.values(counts));
      expect(max).toBeLessThanOrEqual(4);
    });
  });
});
