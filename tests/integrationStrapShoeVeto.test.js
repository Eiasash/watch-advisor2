import { describe, it, expect, vi } from "vitest";

// Mock stores that buildOutfit imports
vi.mock("../src/stores/rejectStore.js", () => ({
  useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
}));
const _strapMock = { getActiveStrapObj: () => null };
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: { getState: () => _strapMock },
}));

import { strapShoeScore } from "../src/outfitEngine/scoring.js";
import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

describe("Integration: strapShoeScore scoring", () => {
  it("brown leather strap + brown shoes → 1.0", () => {
    const watch = { strap: "brown leather", dial: "silver-white", formality: 7 };
    const shoe = { type: "shoes", color: "brown", formality: 7 };
    expect(strapShoeScore(watch, shoe)).toBe(1.0);
  });

  it("brown leather strap + black shoes → 1.0 (rule disabled)", () => {
    const watch = { strap: "brown leather", dial: "silver-white", formality: 7 };
    const shoe = { type: "shoes", color: "black", formality: 7 };
    expect(strapShoeScore(watch, shoe)).toBe(1.0);
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
  it("brown strap watch picks some shoe (rule disabled, any color accepted)", () => {
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

describe("Integration: strap recommendation suppression", () => {
  it("suppresses recommendation when recommended strap matches active strap", () => {
    _strapMock.getActiveStrapObj = () => ({ id: "strap-brown", label: "Brown Leather", color: "brown", type: "leather" });

    const watch = {
      id: "w-strap-test", brand: "JLC", model: "Reverso", dial: "silver-white",
      style: "dress", formality: 8, genuine: true,
      strap: "brown leather",
      straps: [
        { id: "strap-brown", type: "leather", color: "brown", label: "Brown Leather" },
        { id: "strap-black", type: "leather", color: "black", label: "Black Leather" },
      ],
    };
    const garments = [
      { id: "g1", type: "shirt", color: "white", formality: 7, name: "White shirt" },
      { id: "g2", type: "pants", color: "grey", formality: 7, name: "Grey pants" },
      { id: "g3", type: "shoes", color: "brown", formality: 7, name: "Brown shoes" },
    ];
    // Brown shoes → recommends brown leather strap → same as active → suppress
    const outfit = buildOutfit(watch, garments, {}, [], [], {});
    expect(outfit._strapRecommendation).toBeNull();

    _strapMock.getActiveStrapObj = () => null;
  });

  it("shows recommendation when recommended strap differs from active strap", () => {
    // Active strap is bracelet, but recommended will be brown leather (for brown shoes)
    _strapMock.getActiveStrapObj = () => ({ id: "strap-bracelet", label: "Bracelet", type: "bracelet" });

    const watch = {
      id: "w-strap-test2", brand: "JLC", model: "Reverso", dial: "silver-white",
      style: "dress", formality: 8, genuine: true,
      strap: "bracelet",
      straps: [
        { id: "strap-brown", type: "leather", color: "brown", label: "Brown Leather" },
        { id: "strap-bracelet", type: "bracelet", label: "Bracelet" },
      ],
    };
    const garments = [
      { id: "g1", type: "shirt", color: "white", formality: 7, name: "White shirt" },
      { id: "g2", type: "pants", color: "grey", formality: 7, name: "Grey pants" },
      { id: "g3", type: "shoes", color: "brown", formality: 7, name: "Brown shoes" },
    ];
    // Bracelet active → brown shoes picked → recommends brown leather → differs from bracelet → show
    const outfit = buildOutfit(watch, garments, {}, [], [], {});
    expect(outfit._strapRecommendation).not.toBeNull();
    expect(outfit._strapRecommendation.id).toBe("strap-brown");

    _strapMock.getActiveStrapObj = () => null;
  });
});
