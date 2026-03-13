/**
 * Edge cases for buildOutfit() null-guard and metadata stability.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");

// ─── Null watch ──────────────────────────────────────────────────────────────

describe("buildOutfit — null watch always returns metadata", () => {
  it("returns safe fallback with metadata when watch is null", () => {
    const outfit = buildOutfit(null, []);
    expect(outfit.shirt).toBeNull();
    expect(outfit._score).toBe(0);
    expect(outfit._confidence).toBe(0);
    expect(outfit._confidenceLabel).toBe("none");
    expect(Array.isArray(outfit._explanation)).toBe(true);
    expect(outfit._explanation.length).toBeGreaterThan(0);
  });
});

// ─── Empty wardrobe → null-combo guard ──────────────────────────────────────

describe("buildOutfit — empty wardrobe triggers safe fallback", () => {
  it("returns safe fallback when wardrobe is empty", () => {
    const outfit = buildOutfit(snowflake, [], { tempC: 20 });
    expect(outfit._confidence).toBe(0);
    expect(outfit._confidenceLabel).toBe("none");
    expect(outfit._explanation[0]).toMatch(/No valid outfit/);
  });

  it("all slot fields are null in fallback", () => {
    const outfit = buildOutfit(snowflake, [], {});
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
    expect(outfit.jacket).toBeNull();
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
    expect(outfit.belt).toBeNull();
  });
});

// ─── All garments fail constraints ──────────────────────────────────────────

describe("buildOutfit — every garment fails context formality constraint", () => {
  // Context "formal" requires min formality 6.
  // All garments here have formality 1 → all fail the hard gate → -Infinity → shortlists empty.
  const tooInformal = [
    { id: "s1", type: "shirt",   name: "Casual Tee",   color: "white",  formality: 1 },
    { id: "p1", type: "pants",   name: "Jogger",       color: "grey",   formality: 1 },
    { id: "sh1",type: "shoes",   name: "Flip Flops",   color: "tan",    formality: 1 },
  ];

  it("returns safe fallback with _confidenceLabel 'none'", () => {
    const outfit = buildOutfit(reverso, tooInformal, { tempC: 20 }, [], [], {}, {}, "formal");
    expect(outfit._confidence).toBe(0);
    expect(outfit._confidenceLabel).toBe("none");
    expect(outfit._explanation[0]).toMatch(/No valid outfit/);
  });

  it("_explanation is an array", () => {
    const outfit = buildOutfit(reverso, tooInformal, { tempC: 20 }, [], [], {}, {}, "formal");
    expect(Array.isArray(outfit._explanation)).toBe(true);
  });
});

// ─── Successful outfit always has metadata ───────────────────────────────────

describe("buildOutfit — successful outfit always carries metadata", () => {
  const wardrobe = [
    { id: "s1", type: "shirt",  name: "White Oxford", color: "white", formality: 7 },
    { id: "p1", type: "pants",  name: "Grey Chinos",  color: "grey",  formality: 6 },
    { id: "sh1",type: "shoes",  name: "Black Eccos",  color: "black", formality: 7 },
  ];

  it("has _score as a number", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    expect(typeof outfit._score).toBe("number");
  });

  it("has _confidence in [0,1]", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    expect(outfit._confidence).toBeGreaterThanOrEqual(0);
    expect(outfit._confidence).toBeLessThanOrEqual(1);
  });

  it("has _confidenceLabel as a string", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    expect(typeof outfit._confidenceLabel).toBe("string");
    expect(["strong","good","moderate","weak","none"]).toContain(outfit._confidenceLabel);
  });

  it("has _explanation as a non-empty array", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    expect(Array.isArray(outfit._explanation)).toBe(true);
    expect(outfit._explanation.length).toBeGreaterThan(0);
  });

  it("_confidence is never negative", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    expect(outfit._confidence).toBeGreaterThanOrEqual(0);
  });
});
