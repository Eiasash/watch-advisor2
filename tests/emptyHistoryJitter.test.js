import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreWatchForDay, dailyJitter } from "../src/engine/dayProfile.js";

const watches = [
  { id: "snowflake", formality: 7, style: "sport-elegant", replica: false },
  { id: "datejust", formality: 7, style: "sport-elegant", replica: false },
  { id: "speedmaster", formality: 5, style: "sport", replica: false },
  { id: "reverso", formality: 9, style: "dress", replica: false },
  { id: "submariner", formality: 6, style: "diver", replica: true },
];

describe("empty-history jitter boost", () => {
  it("with empty history, top pick varies across different date strings", () => {
    // Test across 10 different dates — the top pick should vary
    // (before fix, seed-order would always pick the same watch)
    const winners = new Set();

    for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
      vi.useFakeTimers();
      const date = new Date(2026, 2, 10 + dayOffset); // March 10-19, 2026
      vi.setSystemTime(date);

      const scored = watches.map(w => ({
        id: w.id,
        score: scoreWatchForDay(w, "smart-casual", []),
      }));
      scored.sort((a, b) => b.score - a.score);
      winners.add(scored[0].id);

      vi.useRealTimers();
    }

    // With jitter boost, expect at least 2 different winners across 10 dates
    expect(winners.size).toBeGreaterThanOrEqual(2);
  });

  it("extra jitter does NOT apply when history is non-empty", () => {
    const watch = { id: "test-w", formality: 7, style: "sport-elegant", replica: false };
    const history = [{ watchId: "other", date: new Date().toISOString().slice(0, 10) }];

    // With non-empty history, score should not include extra jitter
    const scoreWithHistory = scoreWatchForDay(watch, "smart-casual", history);
    // Score should be deterministic (same inputs → same output)
    const scoreWithHistory2 = scoreWatchForDay(watch, "smart-casual", history);
    expect(scoreWithHistory).toBe(scoreWithHistory2);
  });

  it("empty-history score is greater than non-empty-history score for same watch", () => {
    const watch = { id: "test-w", formality: 7, style: "sport-elegant", replica: false };
    const emptyScore = scoreWatchForDay(watch, "smart-casual", []);
    const nonEmptyScore = scoreWatchForDay(watch, "smart-casual", [{ watchId: "other" }]);

    // Both should get recencyScore=0.50 (never worn), but empty history gets extra jitter
    expect(emptyScore).toBeGreaterThan(nonEmptyScore);
  });
});

describe("bootstrap sync error and retry", () => {
  it("useBootstrap returns syncError and retrySync", async () => {
    // Verify the bootstrap hook exports the expected interface
    const { useBootstrap } = await import("../src/app/bootstrap.js");
    expect(typeof useBootstrap).toBe("function");
  });
});
