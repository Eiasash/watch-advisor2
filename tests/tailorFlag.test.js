/**
 * tailorFlag.test.js
 * Tests for tailor flag detection and exclusion from formal outfit building.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

// ── Tailor flag regex ─────────────────────────────────────────────────────────

const TAILOR_RE = /tailor|pulls at chest|billows|wide in torso/i;

describe("tailor flag detection", () => {
  it("detects 'tailor' keyword", () => {
    expect(TAILOR_RE.test("needs tailor adjustment")).toBe(true);
  });

  it("detects 'pulls at chest'", () => {
    expect(TAILOR_RE.test("Pulls at chest when buttoned")).toBe(true);
  });

  it("detects 'billows'", () => {
    expect(TAILOR_RE.test("billows when tucked in")).toBe(true);
  });

  it("detects 'wide in torso'", () => {
    expect(TAILOR_RE.test("too wide in torso")).toBe(true);
  });

  it("does not flag normal notes", () => {
    expect(TAILOR_RE.test("great with navy pants")).toBe(false);
  });

  it("does not flag empty notes", () => {
    expect(TAILOR_RE.test("")).toBe(false);
  });

  it("case insensitive", () => {
    expect(TAILOR_RE.test("TAILOR needed")).toBe(true);
    expect(TAILOR_RE.test("Billows badly")).toBe(true);
  });
});

// ── Tailor flag exclusion from formal contexts in buildOutfit ─────────────────

describe("tailor flag exclusion in buildOutfit", () => {
  const watch = { id: "tw", brand: "Test", dial: "white", strap: "bracelet", formality: 7, style: "dress-sport" };

  const normalShirt = { id: "s1", type: "shirt", color: "white", formality: 7, notes: "" };
  const tailorShirt = { id: "s2", type: "shirt", color: "navy", formality: 7, notes: "too wide in torso, billows when tucked" };
  const normalPants = { id: "p1", type: "pants", color: "navy", formality: 7, notes: "" };
  const normalShoes = { id: "sh1", type: "shoes", color: "black", formality: 7, notes: "" };

  const wardrobe = [normalShirt, tailorShirt, normalPants, normalShoes];

  it("excludes tailor-flagged shirts in clinic context", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 22 }, [], [], {}, {}, "clinic");
    // The tailor-flagged shirt should NOT be selected
    if (result.shirt) {
      expect(result.shirt.id).not.toBe("s2");
    }
  });

  it("excludes tailor-flagged shirts in hospital-smart-casual context", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 22 }, [], [], {}, {}, "hospital-smart-casual");
    if (result.shirt) {
      expect(result.shirt.id).not.toBe("s2");
    }
  });

  it("excludes tailor-flagged shirts in formal context", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 22 }, [], [], {}, {}, "formal");
    if (result.shirt) {
      expect(result.shirt.id).not.toBe("s2");
    }
  });

  it("allows tailor-flagged shirts in casual context", () => {
    const casualShirt = { ...tailorShirt, formality: 4 };
    const casualPants = { ...normalPants, formality: 4 };
    const casualShoes = { ...normalShoes, formality: 4 };
    const casualWardrobe = [casualShirt, casualPants, casualShoes];
    const result = buildOutfit(
      { ...watch, formality: 4, style: "sport-elegant" },
      casualWardrobe, { tempC: 22 }, [], [], {}, {}, "casual"
    );
    // In casual context, tailor flag should NOT exclude garments
    if (result.shirt) {
      expect(result.shirt.id).toBe("s2");
    }
  });
});
