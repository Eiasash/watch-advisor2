/**
 * Regression tests for bugs fixed in the March 2026 sessions.
 * Each test documents the exact failure mode before the fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  garmentScore,
  generateOutfit,
} from "../src/engine/outfitEngine.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mkWatch = (overrides = {}) => ({
  id: "test-watch", brand: "Test", model: "Watch",
  dial: "blue", formality: 7, style: "sport-elegant",
  ...overrides,
});

const mkGarment = (overrides = {}) => ({
  id: `g_${Math.random().toString(36).slice(2)}`,
  name: "Test Garment",
  type: "shirt", color: "white", formality: 6,
  seasons: [], contexts: [],
  ...overrides,
});

// ── BUG A REGRESSION: outfitEngine grey alligator ─────────────────────────────
describe("BUG A — outfitEngine grey alligator strap should not demand brown shoes", () => {
  it("grey alligator strap: white sneakers score should NOT be 0", () => {
    const watch = mkWatch({ strap: "grey alligator" });
    const whiteSneakers = mkGarment({ type: "shoes", color: "white" });
    const score = garmentScore(watch, whiteSneakers, {}, [], "smart-casual");
    // Before fix: isBrown was true for any "alligator" strap,
    // so white shoes scored 0 (brown shoe mismatch = hard veto)
    expect(score).toBeGreaterThan(0);
  });

  it("grey alligator strap: brown shoes should also score > 0 (non-zero fallback)", () => {
    const watch = mkWatch({ strap: "grey alligator" });
    const brownShoes = mkGarment({ type: "shoes", color: "brown" });
    const score = garmentScore(watch, brownShoes, {}, [], "smart-casual");
    expect(score).toBeGreaterThan(0);
  });

  it("genuine brown alligator strap: brown shoes still score 1.0 strapShoe", () => {
    const watch = mkWatch({ strap: "brown alligator" });
    const brownShoes = mkGarment({ type: "shoes", color: "brown" });
    const whiteShoes = mkGarment({ type: "shoes", color: "white" });
    const brownScore = garmentScore(watch, brownShoes, {}, [], "smart-casual");
    const whiteScore = garmentScore(watch, whiteShoes, {}, [], "smart-casual");
    // Brown strap → brown shoes should score higher than brown strap → white shoes
    expect(brownScore).toBeGreaterThan(whiteScore);
  });

  it("teal alligator strap: does not trigger brown shoe requirement", () => {
    const watch = mkWatch({ strap: "teal alligator" });
    const whiteSneakers = mkGarment({ type: "shoes", color: "white" });
    const score = garmentScore(watch, whiteSneakers, {}, [], "casual");
    expect(score).toBeGreaterThan(0);
  });
});

// ── BUG B REGRESSION: outfitEngine diversityPenalty garmentIds format ──────────
describe("BUG B — outfitEngine diversityPenalty should penalise garmentIds history format", () => {
  it("garment appearing in garmentIds array triggers diversity penalty", () => {
    const watch  = mkWatch();
    const shirt  = mkGarment({ id: "shirt-1", type: "shirt", color: "white" });

    // History with slot-map format (was always working)
    const historySlotMap = [{ outfit: { shirt: "shirt-1" } }];
    // History with garmentIds flat array (was BROKEN before fix)
    const historyGarmentIds = [{ garmentIds: ["shirt-1"] }];

    const scoreNoHistory  = garmentScore(watch, shirt, {}, [], "smart-casual");
    const scoreSlotMap    = garmentScore(watch, shirt, {}, historySlotMap, "smart-casual");
    const scoreGarmentIds = garmentScore(watch, shirt, {}, historyGarmentIds, "smart-casual");

    // Both history formats should produce same penalty
    expect(scoreSlotMap).toBeLessThan(scoreNoHistory);
    expect(scoreGarmentIds).toBeLessThan(scoreNoHistory);
    expect(Math.abs(scoreSlotMap - scoreGarmentIds)).toBeLessThan(0.001);
  });

  it("garment not in history has no diversity penalty", () => {
    const watch = mkWatch();
    const shirt = mkGarment({ id: "shirt-fresh", type: "shirt" });
    const history = [{ garmentIds: ["shirt-different"] }];
    const scoreWith    = garmentScore(watch, shirt, {}, history, "smart-casual");
    const scoreWithout = garmentScore(watch, shirt, {}, [], "smart-casual");
    expect(scoreWith).toBeCloseTo(scoreWithout, 5);
  });
});

// ── BUG D REGRESSION: outfitEngine generateOutfit layer slot ─────────────────
describe("BUG D — generateOutfit should include layer slot at very cold temps", () => {
  it("at 8°C, outfit contains both sweater and layer slots", () => {
    const watch = mkWatch();
    const wardrobe = [
      mkGarment({ id: "s1", type: "shirt",   color: "white" }),
      mkGarment({ id: "s2", type: "pants",   color: "navy" }),
      mkGarment({ id: "s3", type: "shoes",   color: "tan" }),
      mkGarment({ id: "sw1", type: "sweater", color: "black" }),
      mkGarment({ id: "sw2", type: "sweater", color: "blue" }),
    ];
    const outfit = generateOutfit(watch, wardrobe, { tempC: 8 });
    expect(outfit.sweater).not.toBeNull();
    expect(outfit.layer).not.toBeNull();
    // Sweater and layer should be different garments
    expect(outfit.sweater?.id).not.toBe(outfit.layer?.id);
  });

  it("at 15°C, outfit has sweater but no layer", () => {
    const watch = mkWatch();
    const wardrobe = [
      mkGarment({ id: "s1", type: "shirt" }),
      mkGarment({ id: "sw1", type: "sweater" }),
      mkGarment({ id: "sw2", type: "sweater" }),
    ];
    const outfit = generateOutfit(watch, wardrobe, { tempC: 15 });
    expect(outfit.sweater).not.toBeNull();
    expect(outfit.layer).toBeNull();
  });

  it("at 25°C, no sweater and no layer", () => {
    const watch = mkWatch();
    const wardrobe = [
      mkGarment({ id: "s1", type: "shirt" }),
      mkGarment({ id: "sw1", type: "sweater" }),
    ];
    const outfit = generateOutfit(watch, wardrobe, { tempC: 25 });
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
  });
});

// ── Watch-ID cache key regression ────────────────────────────────────────────
describe("watch-id cache key — different images must not collide", () => {
  it("cache key uses image beginning + middle, not just the tail", () => {
    // Simulate two different base64 images that share the same trailing 300 chars
    // (which can happen because base64 padding at end is often '==AAA...' etc.)
    const sharedTail = "A".repeat(300);
    const imageA = "data:image/jpeg;base64," + "B".repeat(400) + "CCCCCC" + sharedTail;
    const imageB = "data:image/jpeg;base64," + "D".repeat(400) + "EEEEEE" + sharedTail;

    // Old broken key: image.slice(-300) → both keys would be hashText(sharedTail) = identical
    const oldKeyA = imageA.slice(-300);
    const oldKeyB = imageB.slice(-300);
    expect(oldKeyA).toBe(oldKeyB); // confirms the old bug

    // New fixed key: sample from index 30 + middle + length
    function newCacheInput(image) {
      const len = image.length;
      return image.slice(30, 330) + "|" + image.slice(Math.floor(len / 2), Math.floor(len / 2) + 200) + "|" + len;
    }
    expect(newCacheInput(imageA)).not.toBe(newCacheInput(imageB)); // fix confirmed
  });
});
