/**
 * Tests for palette coherence engine features — March 2026.
 *
 * 1. pantsShoeHarmony — warm/cool tone scoring
 * 2. pickBelt — auto-match belt to shoe color
 * 3. buildOutfit belt slot — belt appears in output
 * 4. Pants-shoe coherence swap — warm pants + forced black shoes → engine swaps pants
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/stores/rejectStore.js", () => ({
  useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
}));
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: { getState: () => ({ getActiveStrapObj: () => null }) },
}));

import { pantsShoeHarmony, pickBelt } from "../src/outfitEngine/scoring.js";
import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

// ─── pantsShoeHarmony ───────────────────────────────────────────────────────

describe("pantsShoeHarmony", () => {
  it("warm pants + warm shoes → 1.0", () => {
    expect(pantsShoeHarmony({ color: "khaki" }, { color: "tan" })).toBe(1.0);
  });

  it("cool pants + cool shoes → 1.0", () => {
    expect(pantsShoeHarmony({ color: "grey" }, { color: "black" })).toBe(1.0);
  });

  it("warm pants + black shoes → 0.3 (jarring)", () => {
    expect(pantsShoeHarmony({ color: "stone" }, { color: "black" })).toBe(0.3);
  });

  it("cool pants + brown shoes → 0.5 (mild clash)", () => {
    expect(pantsShoeHarmony({ color: "navy" }, { color: "brown" })).toBe(0.5);
  });

  it("any pants + white shoes → 0.9 (neutral)", () => {
    expect(pantsShoeHarmony({ color: "stone" }, { color: "white" })).toBe(0.9);
  });

  it("white pants + any shoes → 0.9 (neutral)", () => {
    expect(pantsShoeHarmony({ color: "white" }, { color: "black" })).toBe(0.9);
  });

  it("slate pants + black shoes → 1.0 (both cool)", () => {
    expect(pantsShoeHarmony({ color: "slate" }, { color: "black" })).toBe(1.0);
  });

  it("dark brown pants + dark brown shoes → 1.0", () => {
    expect(pantsShoeHarmony({ color: "dark brown" }, { color: "dark brown" })).toBe(1.0);
  });

  it("null pants → 0.7 (neutral fallback)", () => {
    expect(pantsShoeHarmony(null, { color: "black" })).toBe(0.7);
  });

  it("null shoes → 0.7 (neutral fallback)", () => {
    expect(pantsShoeHarmony({ color: "grey" }, null)).toBe(0.7);
  });

  it("indigo pants + black shoes → 1.0 (both cool)", () => {
    expect(pantsShoeHarmony({ color: "indigo" }, { color: "black" })).toBe(1.0);
  });

  it("cream pants + black shoes → 0.3 (warm + cool)", () => {
    expect(pantsShoeHarmony({ color: "cream" }, { color: "black" })).toBe(0.3);
  });
});

// ─── pickBelt ───────────────────────────────────────────────────────────────

describe("pickBelt", () => {
  const belts = [
    { id: "b1", type: "belt", color: "tan", name: "Tan Belt" },
    { id: "b2", type: "belt", color: "dark brown", name: "Dark Brown Belt" },
    { id: "b3", type: "belt", color: "black", name: "Black Belt" },
  ];

  it("black shoes → black belt", () => {
    expect(pickBelt({ color: "black" }, belts).id).toBe("b3");
  });

  it("tan shoes → tan belt", () => {
    expect(pickBelt({ color: "tan" }, belts).id).toBe("b1");
  });

  it("brown shoes → brown family belt", () => {
    expect(pickBelt({ color: "brown" }, belts).id).toBe("b2");
  });

  it("dark brown shoes → dark brown belt", () => {
    expect(pickBelt({ color: "dark brown" }, belts).id).toBe("b2");
  });

  it("white shoes → returns first belt (no preference)", () => {
    expect(pickBelt({ color: "white" }, belts)).toBeTruthy();
  });

  it("null shoes → null", () => {
    expect(pickBelt(null, belts)).toBeNull();
  });

  it("empty belts → null", () => {
    expect(pickBelt({ color: "black" }, [])).toBeNull();
  });
});

// ─── buildOutfit belt slot ──────────────────────────────────────────────────

describe("buildOutfit — belt slot", () => {
  const watch = {
    id: "snowflake", style: "sport-elegant", formality: 7, dial: "silver-white",
    strap: "bracelet",
  };
  const wardrobe = [
    { id: "s1", type: "shirt", color: "white", formality: 7, name: "Shirt" },
    { id: "p1", type: "pants", color: "grey", formality: 7, name: "Pants" },
    { id: "sh1", type: "shoes", color: "black", formality: 7, name: "Black Shoes" },
    { id: "b1", type: "belt", color: "black", name: "Black Belt" },
    { id: "b2", type: "belt", color: "tan", name: "Tan Belt" },
  ];

  it("picks belt matching shoe color", () => {
    const outfit = buildOutfit(watch, wardrobe, {});
    expect(outfit.belt).toBeTruthy();
    expect(outfit.belt.color).toBe("black");
  });

  it("null outfit includes belt: null", () => {
    const outfit = buildOutfit(null, wardrobe, {});
    expect(outfit.belt).toBeNull();
  });
});

// ─── Pants-shoe coherence swap ──────────────────────────────────────────────

describe("buildOutfit — pants-shoe palette coherence", () => {
  it("navy strap forces black shoes → engine avoids warm pants", () => {
    const reverso = {
      id: "reverso", style: "dress", formality: 9, dial: "navy",
      strap: "leather",
      straps: [{ label: "Navy alligator", color: "navy", type: "leather" }],
    };
    const wardrobe = [
      { id: "s1", type: "shirt", color: "grey", formality: 7, name: "Grey Shirt" },
      { id: "p1", type: "pants", color: "stone", formality: 7, name: "Stone Trousers" }, // warm
      { id: "p2", type: "pants", color: "grey", formality: 7, name: "Grey Trousers" },   // cool
      { id: "p3", type: "pants", color: "slate", formality: 6, name: "Slate Jeans" },     // cool
      { id: "sh1", type: "shoes", color: "black", formality: 8, name: "Black Shoes" },
      { id: "sh2", type: "shoes", color: "tan", formality: 6, name: "Tan Shoes" },
      { id: "b1", type: "belt", color: "black", name: "Black Belt" },
    ];
    const outfit = buildOutfit(reverso, wardrobe, { tempC: 15 });
    // Navy alligator → black shoes only. Engine should avoid stone pants.
    expect(outfit.shoes.color).toBe("black");
    // Pants should be grey or slate, NOT stone (warm + black = 0.3 harmony)
    expect(["grey", "slate"]).toContain(outfit.pants.color);
  });

  it("bracelet watch has no forced shoe constraint — warm pants + brown shoes OK", () => {
    const santos = {
      id: "santos", style: "dress-sport", formality: 8, dial: "white",
      strap: "bracelet",
    };
    const wardrobe = [
      { id: "s1", type: "shirt", color: "white", formality: 7, name: "Shirt" },
      { id: "p1", type: "pants", color: "stone", formality: 7, name: "Stone Trousers" },
      { id: "sh1", type: "shoes", color: "tan", formality: 6, name: "Tan Shoes" },
      { id: "sh2", type: "shoes", color: "black", formality: 8, name: "Black Shoes" },
      { id: "b1", type: "belt", color: "tan", name: "Tan Belt" },
    ];
    const outfit = buildOutfit(santos, wardrobe, {});
    // Bracelet = no strap lock. stone pants + tan shoes = warm harmony (1.0)
    // Engine should not forcibly swap pants
    expect(outfit.pants).toBeTruthy();
  });
});
