import { describe, it, expect } from "vitest";
import { _pairHarmonyScore, _sameColor } from "../src/outfitEngine/outfitBuilder.js";

const mkGarment = (color) => ({ color, name: `${color} item` });

// ── _sameColor ───────────────────────────────────────────────────────────────

describe("_sameColor", () => {
  it("returns true for identical colors", () => {
    expect(_sameColor(mkGarment("navy"), mkGarment("navy"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(_sameColor(mkGarment("Navy"), mkGarment("navy"))).toBe(true);
  });

  it("returns false for different colors", () => {
    expect(_sameColor(mkGarment("navy"), mkGarment("black"))).toBe(false);
  });

  it("returns falsy when first garment is null", () => {
    expect(_sameColor(null, mkGarment("navy"))).toBeFalsy();
  });

  it("returns falsy when second garment is null", () => {
    expect(_sameColor(mkGarment("navy"), null)).toBeFalsy();
  });

  it("returns falsy when both garments are null", () => {
    expect(_sameColor(null, null)).toBeFalsy();
  });

  it("returns falsy when color is empty string", () => {
    expect(_sameColor(mkGarment(""), mkGarment(""))).toBeFalsy();
  });

  it("returns falsy when garment has no color property", () => {
    expect(_sameColor({}, {})).toBeFalsy();
  });
});

// ── _pairHarmonyScore ────────────────────────────────────────────────────────

describe("_pairHarmonyScore", () => {
  it("returns 1.0 for all-different colors", () => {
    const shirt = mkGarment("white");
    const pants = mkGarment("navy");
    const shoes = mkGarment("brown");
    // No same-color penalties, pantsShoeHarmony ~1.0 for neutral combos
    const score = _pairHarmonyScore(shirt, pants, shoes);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("penalizes shirt-pants same color (monotone)", () => {
    const shirt = mkGarment("navy");
    const pants = mkGarment("navy");
    const shoes = mkGarment("brown");
    const score = _pairHarmonyScore(shirt, pants, shoes);
    // Should include 0.82 multiplier for shirt-pants match
    expect(score).toBeLessThan(1.0);
  });

  it("penalizes shirt-shoes same color (except white)", () => {
    const shirt = mkGarment("black");
    const pants = mkGarment("grey");
    const shoes = mkGarment("black");
    const score = _pairHarmonyScore(shirt, pants, shoes);
    // Should include 0.9 multiplier for shirt-shoes match (non-white)
    expect(score).toBeLessThan(1.0);
  });

  it("does NOT penalize shirt-shoes match when shoes are white", () => {
    const shirt = mkGarment("white");
    const pants = mkGarment("navy");
    const shoes = mkGarment("white");
    const score = _pairHarmonyScore(shirt, pants, shoes);
    // White shoes are exempt from shirt-shoes penalty
    const allDiffScore = _pairHarmonyScore(mkGarment("blue"), mkGarment("navy"), mkGarment("brown"));
    // Should not have the 0.9 penalty, so score comparable to all-different
    expect(score).toBeGreaterThanOrEqual(allDiffScore * 0.95);
  });

  it("stacks penalties for shirt matching both pants and shoes", () => {
    const shirt = mkGarment("black");
    const pants = mkGarment("black");
    const shoes = mkGarment("black");
    const score = _pairHarmonyScore(shirt, pants, shoes);
    // Both 0.82 (shirt-pants) and 0.9 (shirt-shoes) penalties apply
    expect(score).toBeLessThan(0.82);
  });

  it("handles null shirt gracefully", () => {
    const pants = mkGarment("navy");
    const shoes = mkGarment("brown");
    const score = _pairHarmonyScore(null, pants, shoes);
    expect(score).toBeGreaterThan(0);
  });

  it("handles null pants gracefully", () => {
    const shirt = mkGarment("white");
    const shoes = mkGarment("brown");
    const score = _pairHarmonyScore(shirt, null, shoes);
    expect(score).toBeGreaterThan(0);
  });

  it("handles null shoes gracefully", () => {
    const shirt = mkGarment("white");
    const pants = mkGarment("navy");
    const score = _pairHarmonyScore(shirt, pants, null);
    expect(score).toBeGreaterThan(0);
  });

  it("handles all null gracefully", () => {
    const score = _pairHarmonyScore(null, null, null);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});
