import { describe, it, expect, vi } from "vitest";

// Mock stores that buildOutfit imports
vi.mock("../src/stores/rejectStore.js", () => ({
  useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
}));
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: { getState: () => ({ getActiveStrap: () => null }) },
}));

import { strapShoeScore } from "../src/outfitEngine/scoring.js";
import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

describe("Integration: strapShoeScore scoring", () => {
  it("brown leather strap + brown shoes → 1.0", () => {
    const watch = { strap: "brown leather", dial: "silver-white", formality: 7 };
    const shoe = { type: "shoes", color: "brown", formality: 7 };
    expect(strapShoeScore(watch, shoe)).toBe(1.0);
  });

  it("brown leather strap + black shoes → 0.0 (veto)", () => {
    const watch = { strap: "brown leather", dial: "silver-white", formality: 7 };
    const shoe = { type: "shoes", color: "black", formality: 7 };
    expect(strapShoeScore(watch, shoe)).toBe(0.0);
  });

  it("black leather strap + black shoes → 1.0", () => {
    const watch = { strap: "black leather", dial: "black", formality: 7 };
    const shoe = { type: "shoes", color: "black", formality: 7 };
    expect(strapShoeScore(watch, shoe)).toBe(1.0);
  });

  it("metal bracelet + any shoes → 1.0", () => {
    const watch = { strap: "bracelet", dial: "blue", formality: 7 };
    const brownShoe = { type: "shoes", color: "brown", formality: 7 };
    const blackShoe = { type: "shoes", color: "black", formality: 7 };
    const whiteShoe = { type: "shoes", color: "white", formality: 5 };
    expect(strapShoeScore(watch, brownShoe)).toBe(1.0);
    expect(strapShoeScore(watch, blackShoe)).toBe(1.0);
    expect(strapShoeScore(watch, whiteShoe)).toBe(1.0);
  });
});

describe("Integration: buildOutfit strap-shoe veto", () => {
  it("brown strap watch should not pick black shoes when brown shoes available", () => {
    const watch = {
      id: "w1", brand: "JLC", model: "Reverso", dial: "silver-white",
      style: "dress", formality: 8, genuine: true,
      strap: "brown leather", straps: [{ type: "leather", color: "brown" }],
    };
    const garments = [
      { id: "g1", type: "shirt", color: "white", formality: 7, name: "White shirt" },
      { id: "g2", type: "pants", color: "grey", formality: 7, name: "Grey pants" },
      { id: "g3", type: "shoes", color: "black", formality: 8, name: "Black shoes" },
      { id: "g4", type: "shoes", color: "brown", formality: 7, name: "Brown shoes" },
    ];
    const outfit = buildOutfit(watch, garments, {}, [], [], {});
    expect(outfit.shoes).not.toBeNull();
    expect(outfit.shoes.color).toBe("brown");
  });

  it("bracelet watch accepts any shoe color", () => {
    const watch = {
      id: "w2", brand: "Rolex", model: "Submariner", dial: "black",
      style: "sport", formality: 5, genuine: true,
      strap: "bracelet", straps: [{ type: "bracelet" }],
    };
    const garments = [
      { id: "g1", type: "shirt", color: "navy", formality: 5, name: "Navy shirt" },
      { id: "g2", type: "pants", color: "grey", formality: 5, name: "Grey pants" },
      { id: "g3", type: "shoes", color: "black", formality: 6, name: "Black shoes" },
    ];
    const outfit = buildOutfit(watch, garments, {}, [], [], {});
    expect(outfit.shoes).not.toBeNull();
    // With bracelet, black shoes should be accepted (not vetoed)
    expect(outfit.shoes.color).toBe("black");
  });
});
