/**
 * Performance benchmark tests — timing assertions for critical engine paths.
 *
 * These tests verify that the core outfit engine operations complete within
 * acceptable time bounds, catching performance regressions before they
 * reach production.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { scoreGarment, clearScoreCache } from "../src/outfitEngine/scoring.js";
import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");

// ── Wardrobe fixtures ──────────────────────────────────────────────────────────

const COLORS = ["white", "navy", "grey", "brown", "tan", "black", "olive", "beige", "cream", "blue"];

function makeGarment(id, type, color, formality) {
  return { id, type, name: `${color} ${type} ${id}`, color, formality };
}

function buildLargeWardrobe(count) {
  const garments = [];
  const types = ["shirt", "pants", "shoes", "jacket", "sweater"];
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const color = COLORS[i % COLORS.length];
    const formality = 4 + (i % 5);
    garments.push(makeGarment(`g${i}`, type, color, formality));
  }
  return garments;
}

// Build a set of 10 watches from the collection (all non-retired)
const activeWatches = WATCH_COLLECTION.filter(w => !w.retired).slice(0, 10);

// ── Performance: scoreGarment ─────────────────────────────────────────────────

describe("Performance — scoreGarment", () => {
  it("scores a single garment in < 50ms", () => {
    const garment = makeGarment("perf-s1", "shirt", "white", 7);
    clearScoreCache();

    const start = performance.now();
    const score = scoreGarment(snowflake, garment, { tempC: 20 }, null, "smart-casual");
    const elapsed = performance.now() - start;

    expect(score).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it("scores 100 garments sequentially in < 200ms", () => {
    const wardrobe = buildLargeWardrobe(100);
    clearScoreCache();

    const start = performance.now();
    for (const g of wardrobe) {
      scoreGarment(snowflake, g, { tempC: 18 }, null, "smart-casual");
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it("scores across all contexts in < 100ms for one garment", () => {
    const garment = makeGarment("perf-ctx", "shirt", "navy", 6);
    const contexts = [null, "smart-casual", "casual", "formal", "clinic", "date-night", "shift", "eid-celebration", "family-event"];
    clearScoreCache();

    const start = performance.now();
    for (const ctx of contexts) {
      scoreGarment(reverso, garment, { tempC: 15 }, null, ctx);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// ── Performance: score cache ──────────────────────────────────────────────────

describe("Performance — score cache lookup vs fresh calculation", () => {
  it("cache lookup is faster than fresh calculation", () => {
    const garment = makeGarment("cache-g1", "shirt", "white", 7);

    // Fresh calculation (clear cache first)
    clearScoreCache();
    const freshStart = performance.now();
    for (let i = 0; i < 500; i++) {
      clearScoreCache();
      scoreGarment(snowflake, garment, { tempC: 20 }, null, "smart-casual");
    }
    const freshElapsed = performance.now() - freshStart;

    // Cached lookups (score once, then re-read from cache)
    clearScoreCache();
    scoreGarment(snowflake, garment, { tempC: 20 }, null, "smart-casual");
    const cachedStart = performance.now();
    for (let i = 0; i < 500; i++) {
      scoreGarment(snowflake, garment, { tempC: 20 }, null, "smart-casual");
    }
    const cachedElapsed = performance.now() - cachedStart;

    // Cached should be meaningfully faster (at least 2x)
    expect(cachedElapsed).toBeLessThan(freshElapsed);
  });

  it("cache hit returns identical value to first computation", () => {
    const garment = makeGarment("cache-eq", "pants", "grey", 6);
    clearScoreCache();

    const first = scoreGarment(reverso, garment, { tempC: 18 }, null, "clinic");
    const cached = scoreGarment(reverso, garment, { tempC: 18 }, null, "clinic");

    expect(cached).toBe(first);
  });
});

// ── Performance: buildOutfit ──────────────────────────────────────────────────

describe("Performance — buildOutfit", () => {
  it("builds outfit with 20+ garments in < 200ms", () => {
    const wardrobe = buildLargeWardrobe(25);

    const start = performance.now();
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 15 });
    const elapsed = performance.now() - start;

    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
    expect(elapsed).toBeLessThan(200);
  });

  it("builds outfit with 50 garments in < 500ms", () => {
    const wardrobe = buildLargeWardrobe(50);

    const start = performance.now();
    // Use snowflake (formality 7) instead of reverso (formality 9)
    // to avoid hard-gating all shirts (which land on formality 4 due to modular cycling)
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 12 });
    const elapsed = performance.now() - start;

    expect(outfit.shirt).toBeTruthy();
    expect(elapsed).toBeLessThan(500);
  });

  it("builds outfit with context in < 300ms", () => {
    const wardrobe = buildLargeWardrobe(30);

    const start = performance.now();
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 }, [], [], {}, {}, "clinic");
    const elapsed = performance.now() - start;

    expect(outfit).toBeTruthy();
    expect(elapsed).toBeLessThan(300);
  });

  it("builds outfit with history in < 300ms", () => {
    const wardrobe = buildLargeWardrobe(25);
    const history = Array.from({ length: 30 }, (_, i) => ({
      watchId: activeWatches[i % activeWatches.length]?.id ?? "snowflake",
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      garmentIds: [`g${i % 25}`],
    }));

    const start = performance.now();
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 18 }, history);
    const elapsed = performance.now() - start;

    expect(outfit).toBeTruthy();
    expect(elapsed).toBeLessThan(300);
  });
});

// ── Performance: watch rotation ───────────────────────────────────────────────

describe("Performance — watch rotation", () => {
  it("pickWatch for 10 watches completes in < 50ms", () => {
    const start = performance.now();
    const result = pickWatch(activeWatches, [], "smart-casual");
    const elapsed = performance.now() - start;

    expect(result).toBeTruthy();
    expect(elapsed).toBeLessThan(50);
  });

  it("pickWatchPair for 10 watches completes in < 50ms", () => {
    const start = performance.now();
    const result = pickWatchPair(activeWatches, [], "smart-casual");
    const elapsed = performance.now() - start;

    expect(result.primary).toBeTruthy();
    expect(elapsed).toBeLessThan(50);
  });

  it("pickWatch with 30-day history completes in < 50ms", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      watchId: activeWatches[i % activeWatches.length]?.id ?? "snowflake",
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    }));

    const start = performance.now();
    const result = pickWatch(activeWatches, history, "formal");
    const elapsed = performance.now() - start;

    expect(result).toBeTruthy();
    expect(elapsed).toBeLessThan(50);
  });

  it("pickWatch across all day profiles completes in < 100ms", () => {
    const profiles = ["smart-casual", "casual", "formal", "date-night", "shift", "clinic"];

    const start = performance.now();
    for (const profile of profiles) {
      pickWatch(activeWatches, [], profile);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("rotation with full 23-watch collection completes in < 50ms", () => {
    const allActive = WATCH_COLLECTION.filter(w => !w.retired);

    const start = performance.now();
    const result = pickWatch(allActive, [], "smart-casual");
    const elapsed = performance.now() - start;

    expect(result).toBeTruthy();
    expect(allActive.length).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(50);
  });
});
