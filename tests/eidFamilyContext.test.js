/**
 * eidFamilyContext.test.js
 * Tests for eid-celebration and family-event context support:
 * - Context formality thresholds
 * - Strap-shoe rule relaxation (0.6 instead of 0.0 for mismatches)
 * - filterShoesByStrap passes context through
 * - Tailor flag exclusion from formal contexts
 */

import { describe, it, expect } from "vitest";
import {
  strapShoeScore, contextFormalityScore, scoreGarment,
  filterShoesByStrap, CONTEXT_FORMALITY,
} from "../src/outfitEngine/scoring.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const brownStrapWatch = { id: "test-w", brand: "Test", dial: "white", strap: "brown leather", formality: 7, style: "dress-sport" };
const blackStrapWatch = { id: "test-w2", brand: "Test", dial: "black", strap: "black alligator", formality: 7, style: "dress" };
const braceletWatch   = { id: "test-w3", brand: "Test", dial: "blue", strap: "bracelet", formality: 7, style: "sport-elegant" };

const navyShoes   = { id: "s1", type: "shoes", color: "navy", formality: 6 };
const brownShoes  = { id: "s2", type: "shoes", color: "brown", formality: 6 };
const blackShoes  = { id: "s3", type: "shoes", color: "black", formality: 7 };
const whiteShoes  = { id: "s4", type: "shoes", color: "white", formality: 4 };

const navyPants   = { id: "p1", type: "pants", color: "navy", formality: 6 };

// ── Context formality thresholds ──────────────────────────────────────────────

describe("eid/family context formality", () => {
  it("CONTEXT_FORMALITY includes eid-celebration", () => {
    expect(CONTEXT_FORMALITY["eid-celebration"]).toEqual({ min: 4, target: 7 });
  });

  it("CONTEXT_FORMALITY includes family-event", () => {
    expect(CONTEXT_FORMALITY["family-event"]).toEqual({ min: 4, target: 7 });
  });

  it("eid-celebration soft-penalises garments below formality 4", () => {
    const lowFormality = { type: "shirt", color: "white", formality: 3 };
    expect(contextFormalityScore(lowFormality, "eid-celebration")).toBe(0.1);
  });

  it("eid-celebration passes garments at formality 4+", () => {
    const okFormality = { type: "shirt", color: "white", formality: 4 };
    expect(contextFormalityScore(okFormality, "eid-celebration")).toBeGreaterThan(0);
  });

  it("family-event passes garments at formality 5", () => {
    const midFormality = { type: "shirt", color: "navy", formality: 5 };
    expect(contextFormalityScore(midFormality, "family-event")).toBeGreaterThan(0);
  });

  it("target 7 means formality 7 scores highest", () => {
    const f7 = contextFormalityScore({ formality: 7 }, "eid-celebration");
    const f5 = contextFormalityScore({ formality: 5 }, "eid-celebration");
    expect(f7).toBeGreaterThan(f5);
  });
});

// ── Strap-shoe rule relaxation ────────────────────────────────────────────────

describe("strapShoeScore context relaxation", () => {
  it("brown strap + navy shoes = 0.0 in clinic (strict)", () => {
    expect(strapShoeScore(brownStrapWatch, navyShoes, "clinic")).toBe(0.0);
  });

  it("brown strap + navy shoes = 0.6 in eid-celebration (relaxed)", () => {
    expect(strapShoeScore(brownStrapWatch, navyShoes, "eid-celebration")).toBe(0.6);
  });

  it("brown strap + navy shoes = 0.6 in family-event (relaxed)", () => {
    expect(strapShoeScore(brownStrapWatch, navyShoes, "family-event")).toBe(0.6);
  });

  it("black strap + navy shoes = 0.6 in eid-celebration", () => {
    expect(strapShoeScore(blackStrapWatch, navyShoes, "eid-celebration")).toBe(0.6);
  });

  it("brown strap + brown shoes = 1.0 regardless of context", () => {
    expect(strapShoeScore(brownStrapWatch, brownShoes, "eid-celebration")).toBe(1.0);
    expect(strapShoeScore(brownStrapWatch, brownShoes, "clinic")).toBe(1.0);
  });

  it("bracelet always exempt (1.0) in any context", () => {
    expect(strapShoeScore(braceletWatch, navyShoes, "eid-celebration")).toBe(1.0);
    expect(strapShoeScore(braceletWatch, navyShoes, "clinic")).toBe(1.0);
  });

  it("non-shoes always return 1.0", () => {
    expect(strapShoeScore(brownStrapWatch, navyPants, "eid-celebration")).toBe(1.0);
  });

  it("brown strap + navy shoes = 0.0 in smart-casual (default strict)", () => {
    expect(strapShoeScore(brownStrapWatch, navyShoes, "smart-casual")).toBe(0.0);
  });

  it("null context keeps strict rules", () => {
    expect(strapShoeScore(brownStrapWatch, navyShoes, null)).toBe(0.0);
    expect(strapShoeScore(brownStrapWatch, navyShoes, undefined)).toBe(0.0);
  });
});

// ── filterShoesByStrap with context ──────────────────────────────────────────

describe("filterShoesByStrap with context", () => {
  const allShoes = [navyShoes, brownShoes, blackShoes, whiteShoes];

  it("strict context filters out mismatched shoes", () => {
    const filtered = filterShoesByStrap(brownStrapWatch, allShoes, "clinic");
    expect(filtered.map(s => s.id)).not.toContain("s1"); // navy excluded
    expect(filtered.map(s => s.id)).toContain("s2");     // brown included
  });

  it("eid context keeps all shoes (relaxed 0.6 > 0.0 threshold)", () => {
    const filtered = filterShoesByStrap(brownStrapWatch, allShoes, "eid-celebration");
    // All shoes should pass since relaxed returns 0.6 instead of 0.0
    expect(filtered.length).toBe(4);
  });

  it("empty array returns empty array", () => {
    expect(filterShoesByStrap(brownStrapWatch, [], "eid-celebration")).toEqual([]);
  });
});

// ── scoreGarment integration ─────────────────────────────────────────────────

describe("scoreGarment with eid/family context", () => {
  it("navy shoes score > 0 with brown strap in eid-celebration", () => {
    const score = scoreGarment(brownStrapWatch, navyShoes, {}, null, "eid-celebration");
    expect(score).toBeGreaterThan(0);
  });

  it("navy shoes score === 0.0 with brown strap in clinic", () => {
    const score = scoreGarment(brownStrapWatch, navyShoes, {}, null, "clinic");
    expect(score).toBe(0.0);
  });
});
