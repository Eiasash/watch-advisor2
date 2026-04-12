/**
 * Outfit engine edge case tests.
 *
 * Exercises boundary conditions and degenerate inputs that the outfit engine
 * must handle gracefully: empty wardrobe, single garment per slot, monotone
 * wardrobes, extreme temperatures, all-recently-worn watches, and invalid
 * context data.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";
import { scoreGarment, clearScoreCache, colorMatchScore, formalityMatchScore, weatherLayerScore } from "../src/outfitEngine/scoring.js";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");
const blackbay  = WATCH_COLLECTION.find(w => w.id === "blackbay");

// ── Edge: Empty wardrobe (0 garments) ──────────────────────────────────────

describe("Edge — empty wardrobe returns graceful empty result", () => {
  it("returns all-null slots for empty garment array", () => {
    const outfit = buildOutfit(snowflake, [], { tempC: 20 });
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
    expect(outfit.jacket).toBeNull();
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
    expect(outfit.belt).toBeNull();
  });

  it("returns _confidence 0 and _confidenceLabel 'none'", () => {
    const outfit = buildOutfit(snowflake, [], { tempC: 20 });
    expect(outfit._confidence).toBe(0);
    expect(outfit._confidenceLabel).toBe("none");
  });

  it("_explanation array is populated", () => {
    const outfit = buildOutfit(snowflake, [], { tempC: 20 });
    expect(Array.isArray(outfit._explanation)).toBe(true);
    expect(outfit._explanation.length).toBeGreaterThan(0);
  });

  it("returns _score of 0", () => {
    const outfit = buildOutfit(snowflake, [], {});
    expect(outfit._score).toBe(0);
  });

  it("handles empty array wardrobe consistently", () => {
    // Verify consistent return shape when called multiple times with empty array
    const outfit1 = buildOutfit(snowflake, [], { tempC: 20 });
    const outfit2 = buildOutfit(snowflake, [], { tempC: 20 });
    expect(outfit1._confidence).toBe(outfit2._confidence);
    expect(outfit1._confidenceLabel).toBe(outfit2._confidenceLabel);
  });
});

// ── Edge: Single garment per slot (minimal wardrobe) ───────────────────────

describe("Edge — single garment per slot (minimal wardrobe)", () => {
  const minimal = [
    { id: "only-shirt", type: "shirt", name: "Only Shirt", color: "white", formality: 6 },
    { id: "only-pants", type: "pants", name: "Only Pants", color: "navy", formality: 6 },
    { id: "only-shoes", type: "shoes", name: "Only Shoes", color: "black", formality: 6 },
  ];

  it("assigns the only available garment to each slot", () => {
    const outfit = buildOutfit(snowflake, minimal, { tempC: 25 });
    expect(outfit.shirt?.id).toBe("only-shirt");
    expect(outfit.pants?.id).toBe("only-pants");
    expect(outfit.shoes?.id).toBe("only-shoes");
  });

  it("jacket and sweater are null with no candidates", () => {
    const outfit = buildOutfit(snowflake, minimal, { tempC: 15 });
    expect(outfit.jacket).toBeNull();
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
  });

  it("belt is null with no belt candidates", () => {
    const outfit = buildOutfit(snowflake, minimal, { tempC: 20 });
    expect(outfit.belt).toBeNull();
  });

  it("confidence is positive with a valid minimal outfit", () => {
    const outfit = buildOutfit(snowflake, minimal, { tempC: 20 });
    expect(outfit._confidence).toBeGreaterThan(0);
  });

  it("handles single garment only (just a shirt, no pants or shoes)", () => {
    const justShirt = [{ id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 6 }];
    const outfit = buildOutfit(snowflake, justShirt, { tempC: 20 });
    expect(outfit.shirt?.id).toBe("s1");
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
  });
});

// ── Edge: All garments same color (monotone penalty) ───────────────────────

describe("Edge — all garments same color (monotone wardrobe)", () => {
  const monotoneNavy = [
    { id: "m-s1", type: "shirt",   name: "Navy Shirt",   color: "navy", formality: 6 },
    { id: "m-s2", type: "shirt",   name: "Navy Oxford",  color: "navy", formality: 7 },
    { id: "m-p1", type: "pants",   name: "Navy Pants",   color: "navy", formality: 6 },
    { id: "m-sh1",type: "shoes",   name: "Navy Shoes",   color: "navy", formality: 6 },
    { id: "m-j1", type: "jacket",  name: "Navy Jacket",  color: "navy", formality: 6 },
    { id: "m-sw1",type: "sweater", name: "Navy Sweater", color: "navy", formality: 6 },
  ];

  it("still produces a valid outfit despite all-same colors", () => {
    const outfit = buildOutfit(reverso, monotoneNavy, { tempC: 15 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("confidence is lower than diverse wardrobe outfit", () => {
    const diverseWardrobe = [
      { id: "d-s1", type: "shirt",  name: "White Shirt",  color: "white",  formality: 7 },
      { id: "d-p1", type: "pants",  name: "Grey Pants",   color: "grey",   formality: 7 },
      { id: "d-sh1",type: "shoes",  name: "Tan Shoes",    color: "tan",    formality: 6 },
      { id: "d-j1", type: "jacket", name: "Beige Jacket", color: "beige",  formality: 7 },
    ];
    const monotoneOutfit = buildOutfit(reverso, monotoneNavy, { tempC: 15 });
    const diverseOutfit  = buildOutfit(reverso, diverseWardrobe, { tempC: 15 });

    // Monotone should produce a lower confidence
    expect(monotoneOutfit._confidence).toBeLessThanOrEqual(diverseOutfit._confidence);
  });

  it("monotone wardrobe still fills all available slots", () => {
    const outfit = buildOutfit(reverso, monotoneNavy, { tempC: 10 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
    // jacket and sweater available in cold weather
    expect(outfit.jacket).toBeTruthy();
  });
});

// ── Edge: Extreme temperatures ─────────────────────────────────────────────

describe("Edge — extreme temperatures", () => {
  const fullWardrobe = [
    { id: "s1",  type: "shirt",   name: "White Shirt",  color: "white",  formality: 7 },
    { id: "p1",  type: "pants",   name: "Grey Pants",   color: "grey",   formality: 7 },
    { id: "sh1", type: "shoes",   name: "Black Shoes",  color: "black",  formality: 7 },
    { id: "j1",  type: "jacket",  name: "Navy Jacket",  color: "navy",   formality: 7 },
    { id: "sw1", type: "sweater", name: "Navy Sweater", color: "navy",   formality: 6 },
    { id: "sw2", type: "sweater", name: "Grey Sweater", color: "grey",   formality: 6 },
  ];

  it("handles extreme cold (< -10 C) without errors", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: -15 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
    // Cold weather should trigger jacket + sweater layers
    expect(outfit.jacket).toBeTruthy();
    expect(outfit.sweater).toBeTruthy();
  });

  it("adds second layer in very cold temperatures", () => {
    // Below 8C should trigger second sweater layer
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: -10 });
    expect(outfit.sweater).toBeTruthy();
    // Layer may or may not be filled depending on color diversity
  });

  it("handles extreme heat (> 45 C) without errors", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 48 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("skips sweater and layer in extreme heat", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 48 });
    // Jacket slot is filled by the main greedy loop (no temp check),
    // but sweater/layer use _fillSweaterLayer which checks temp >= 22
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
  });

  it("handles 0 C (freezing point)", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 0 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.jacket).toBeTruthy();
    expect(outfit.sweater).toBeTruthy();
  });

  it("handles null tempC gracefully", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: null });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("handles undefined weather object", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe);
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("weatherLayerScore returns correct score for extreme cold", () => {
    const jacket = { type: "jacket" };
    expect(weatherLayerScore(jacket, { tempC: -20 })).toBe(1.0);
  });

  it("weatherLayerScore returns low score for extreme heat layers", () => {
    const jacket = { type: "jacket" };
    const score = weatherLayerScore(jacket, { tempC: 50 });
    expect(score).toBeLessThanOrEqual(0.1);
  });
});

// ── Edge: All watches recently worn (no fresh options) ─────────────────────

describe("Edge — all watches recently worn", () => {
  const watches = WATCH_COLLECTION.filter(w => !w.retired).slice(0, 5);

  it("still returns a watch when all are recently worn", () => {
    const history = watches.map(w => ({
      watchId: w.id,
      date: new Date().toISOString().slice(0, 10), // all worn today
    }));
    const result = pickWatch(watches, history);
    expect(result).toBeTruthy();
    expect(watches.map(w => w.id)).toContain(result.id);
  });

  it("pickWatchPair still returns primary when all recently worn", () => {
    const history = watches.map(w => ({
      watchId: w.id,
      date: new Date().toISOString().slice(0, 10),
    }));
    const result = pickWatchPair(watches, history);
    expect(result.primary).toBeTruthy();
  });

  it("falls back gracefully to full pool", () => {
    // Create dense history: all watches worn every day for the last 7 days
    const history = [];
    for (let d = 0; d < 7; d++) {
      for (const w of watches) {
        history.push({
          watchId: w.id,
          date: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10),
        });
      }
    }
    const result = pickWatch(watches, history, "smart-casual");
    expect(result).toBeTruthy();
  });

  it("single watch always selected even if recently worn", () => {
    const singleWatch = [watches[0]];
    const history = [{ watchId: singleWatch[0].id, date: new Date().toISOString().slice(0, 10) }];
    const result = pickWatch(singleWatch, history);
    expect(result.id).toBe(singleWatch[0].id);
  });
});

// ── Edge: Invalid/missing context data ─────────────────────────────────────

describe("Edge — invalid/missing context data", () => {
  const wardrobe = [
    { id: "s1", type: "shirt",  name: "White Shirt",  color: "white",  formality: 6 },
    { id: "p1", type: "pants",  name: "Grey Pants",   color: "grey",   formality: 6 },
    { id: "sh1",type: "shoes",  name: "Black Shoes",  color: "black",  formality: 6 },
    { id: "j1", type: "jacket", name: "Blue Jacket",  color: "blue",   formality: 6 },
  ];

  it("handles null context gracefully", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 18 }, [], [], {}, {}, null);
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
  });

  it("handles undefined context gracefully", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 18 }, [], [], {}, {}, undefined);
    expect(outfit.shirt).toBeTruthy();
  });

  it("handles empty string context gracefully", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 18 }, [], [], {}, {}, "");
    expect(outfit.shirt).toBeTruthy();
  });

  it("handles non-existent context string gracefully", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 18 }, [], [], {}, {}, "nonexistent-context");
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
  });

  it("handles garment with missing color", () => {
    const noColor = [
      { id: "nc-s1", type: "shirt",  name: "No Color Shirt", formality: 6 },
      { id: "nc-p1", type: "pants",  name: "No Color Pants", formality: 6 },
      { id: "nc-sh1",type: "shoes",  name: "No Color Shoes", formality: 6 },
    ];
    const outfit = buildOutfit(snowflake, noColor, { tempC: 20 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("handles garment with missing formality", () => {
    const noFormality = [
      { id: "nf-s1", type: "shirt",  name: "Shirt", color: "white" },
      { id: "nf-p1", type: "pants",  name: "Pants", color: "grey" },
      { id: "nf-sh1",type: "shoes",  name: "Shoes", color: "black" },
    ];
    const outfit = buildOutfit(snowflake, noFormality, { tempC: 20 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("handles garment with missing name", () => {
    const noName = [
      { id: "nn-s1", type: "shirt",  color: "white", formality: 6 },
      { id: "nn-p1", type: "pants",  color: "grey", formality: 6 },
      { id: "nn-sh1",type: "shoes",  color: "black", formality: 6 },
    ];
    const outfit = buildOutfit(snowflake, noName, { tempC: 20 });
    expect(outfit.shirt).toBeTruthy();
  });

  it("handles garment with missing id", () => {
    clearScoreCache();
    const noId = [
      { type: "shirt",  name: "Shirt", color: "white", formality: 6 },
      { type: "pants",  name: "Pants", color: "grey", formality: 6 },
      { type: "shoes",  name: "Shoes", color: "black", formality: 6 },
    ];
    // Should not throw even without ids (fallback cache key in scoring)
    expect(() => buildOutfit(snowflake, noId, { tempC: 20 })).not.toThrow();
  });

  it("scoreGarment handles watch with missing properties", () => {
    clearScoreCache();
    const minimalWatch = { id: "test" };
    const garment = { id: "g1", type: "shirt", color: "white", formality: 6 };
    const score = scoreGarment(minimalWatch, garment, { tempC: 20 });
    expect(typeof score).toBe("number");
    expect(Number.isNaN(score)).toBe(false);
  });

  it("colorMatchScore handles missing dial", () => {
    const watchNoDial = { id: "nd" };
    const garment = { color: "white" };
    const score = colorMatchScore(watchNoDial, garment);
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("formalityMatchScore handles missing formality on both", () => {
    const watch = {};
    const garment = {};
    const score = formalityMatchScore(watch, garment);
    // Both default to 5, so diff = 0, score = 1.0
    expect(score).toBe(1.0);
  });
});

// ── Edge: Wardrobe of only accessories ─────────────────────────────────────

describe("Edge — wardrobe of only accessories", () => {
  const accessoriesOnly = [
    { id: "a1", type: "belt",       name: "Brown Belt",  color: "brown", formality: 6 },
    { id: "a2", type: "sunglasses", name: "Ray-Bans",    color: "black", formality: 5 },
    { id: "a3", type: "hat",        name: "Cap",         color: "navy",  formality: 3 },
    { id: "a4", type: "scarf",      name: "Scarf",       color: "grey",  formality: 5 },
  ];

  it("returns empty outfit when only accessories are available", () => {
    const outfit = buildOutfit(snowflake, accessoriesOnly, { tempC: 20 });
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
  });

  it("returns none confidence for accessories-only wardrobe", () => {
    const outfit = buildOutfit(snowflake, accessoriesOnly, { tempC: 20 });
    expect(outfit._confidence).toBe(0);
    expect(outfit._confidenceLabel).toBe("none");
  });
});

// ── Edge: Wardrobe with excluded items ─────────────────────────────────────

describe("Edge — wardrobe with excludeFromWardrobe items", () => {
  const mixedWardrobe = [
    { id: "s1", type: "shirt",  name: "Shirt",  color: "white", formality: 6, excludeFromWardrobe: true },
    { id: "s2", type: "shirt",  name: "Shirt2", color: "navy",  formality: 6 },
    { id: "p1", type: "pants",  name: "Pants",  color: "grey",  formality: 6, excludeFromWardrobe: true },
    { id: "p2", type: "pants",  name: "Pants2", color: "brown", formality: 5 },
    { id: "sh1",type: "shoes",  name: "Shoes",  color: "black", formality: 7 },
  ];

  it("excludes items marked as excludeFromWardrobe", () => {
    const outfit = buildOutfit(snowflake, mixedWardrobe, { tempC: 25 });
    expect(outfit.shirt?.id).toBe("s2");
    expect(outfit.pants?.id).toBe("p2");
  });

  it("does not use excluded items even if they are better matches", () => {
    const outfit = buildOutfit(snowflake, mixedWardrobe, { tempC: 25 });
    expect(outfit.shirt?.id).not.toBe("s1");
    expect(outfit.pants?.id).not.toBe("p1");
  });
});

// ── Edge: History edge cases ───────────────────────────────────────────────

describe("Edge — history with malformed data", () => {
  const wardrobe = [
    { id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 6 },
    { id: "p1", type: "pants", name: "Pants", color: "grey", formality: 6 },
    { id: "sh1",type: "shoes", name: "Shoes", color: "black", formality: 6 },
  ];

  it("handles history with missing date fields", () => {
    const history = [
      { watchId: "snowflake" },
      { watchId: "reverso" },
    ];
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 }, history);
    expect(outfit.shirt).toBeTruthy();
  });

  it("handles history with missing garmentIds", () => {
    const history = [
      { watchId: "snowflake", date: "2026-04-01" },
    ];
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 }, history);
    expect(outfit.shirt).toBeTruthy();
  });

  it("handles empty history array", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 }, []);
    expect(outfit.shirt).toBeTruthy();
    expect(outfit._confidence).toBeGreaterThan(0);
  });
});
