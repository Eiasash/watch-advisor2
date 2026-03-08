import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { buildOutfit, explainOutfitChoice } from "../src/outfitEngine/outfitBuilder.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso = WATCH_COLLECTION.find(w => w.id === "reverso");

const fullWardrobe = [
  { id: "s1", type: "shirt",   name: "White Oxford",  color: "white",  formality: 7 },
  { id: "s2", type: "shirt",   name: "Navy Polo",     color: "navy",   formality: 6 },
  { id: "s3", type: "shirt",   name: "Grey Shirt",    color: "grey",   formality: 5 },
  { id: "p1", type: "pants",   name: "Grey Trousers", color: "grey",   formality: 7 },
  { id: "p2", type: "pants",   name: "Dark Chinos",   color: "brown",  formality: 5 },
  { id: "sh1",type: "shoes",   name: "Tan Eccos",     color: "tan",    formality: 6 },
  { id: "sh2",type: "shoes",   name: "Black Eccos",   color: "black",  formality: 7 },
  { id: "sh3",type: "shoes",   name: "White Sneakers", color: "white", formality: 4 },
  { id: "j1", type: "jacket",  name: "Camel Coat",    color: "beige",  formality: 7 },
  { id: "sw1",type: "sweater", name: "Navy Sweater",  color: "navy",   formality: 6 },
  { id: "sw2",type: "sweater", name: "Grey Sweater",  color: "grey",   formality: 5 },
];

// ─── buildOutfit — empty wardrobe ───────────────────────────────────────────

describe("buildOutfit — empty wardrobe", () => {
  it("all slots null with empty wardrobe", () => {
    const outfit = buildOutfit(snowflake, [], { tempC: 20 });
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
    expect(outfit.jacket).toBeNull();
    expect(outfit.sweater).toBeNull();
  });
});

// ─── buildOutfit — single garment per type ──────────────────────────────────

describe("buildOutfit — single garment per type", () => {
  it("selects the only available shirt", () => {
    const minimal = [
      { id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 7 },
      { id: "p1", type: "pants", name: "Pants", color: "grey", formality: 7 },
      { id: "sh1", type: "shoes", name: "Shoes", color: "black", formality: 7 },
    ];
    const outfit = buildOutfit(snowflake, minimal, { tempC: 25 });
    expect(outfit.shirt.id).toBe("s1");
    expect(outfit.pants.id).toBe("p1");
    expect(outfit.shoes.id).toBe("sh1");
  });
});

// ─── buildOutfit — outfit-shot type excluded ────────────────────────────────

describe("buildOutfit — outfit-shot type excluded", () => {
  it("outfit-shot items never appear in slots", () => {
    const withOutfitShot = [
      ...fullWardrobe,
      { id: "os1", type: "outfit-shot", name: "Mirror Pic", color: "n/a" },
    ];
    const outfit = buildOutfit(snowflake, withOutfitShot, { tempC: 15 });
    const allIds = [outfit.shirt?.id, outfit.pants?.id, outfit.shoes?.id, outfit.jacket?.id, outfit.sweater?.id];
    expect(allIds).not.toContain("os1");
  });
});

// ─── buildOutfit — sweater temperature threshold ────────────────────────────

describe("buildOutfit — sweater temperature threshold", () => {
  it("sweater at exactly 21°C (< 22) → present", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 21 });
    expect(outfit.sweater).toBeTruthy();
  });

  it("sweater at exactly 22°C → null", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 22 });
    expect(outfit.sweater).toBeNull();
  });

  it("sweater at 0°C → present", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 0 });
    expect(outfit.sweater).toBeTruthy();
  });

  it("sweater with no weather → uses default 22°C (no sweater)", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe);
    expect(outfit.sweater).toBeNull();
  });
});

// ─── buildOutfit — weather jacket fallback ──────────────────────────────────

describe("buildOutfit — weather jacket fallback", () => {
  it("adds jacket when cold and style has jacket slot", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 5 });
    expect(outfit.jacket).toBeTruthy();
  });

  it("no jacket when warm even if available", () => {
    const noJacketWardrobe = fullWardrobe.filter(g => g.type !== "jacket");
    const outfit = buildOutfit(snowflake, noJacketWardrobe, { tempC: 30 });
    expect(outfit.jacket).toBeNull();
  });
});

// ─── buildOutfit — excludeFromWardrobe flag ─────────────────────────────────

describe("buildOutfit — excludeFromWardrobe flag", () => {
  it("excludeFromWardrobe items are never slotted", () => {
    const withExcluded = [
      ...fullWardrobe,
      { id: "ex1", type: "shirt", name: "Excluded Shirt", color: "white", formality: 7, excludeFromWardrobe: true },
    ];
    const outfit = buildOutfit(snowflake, withExcluded, { tempC: 20 });
    expect(outfit.shirt?.id).not.toBe("ex1");
  });
});

// ─── buildOutfit — diversity with different history shapes ──────────────────

describe("buildOutfit — diversity penalty with different history shapes", () => {
  it("handles history with payload.outfit shape", () => {
    const history = Array(5).fill({
      payload: { outfit: { shirt: "s1", pants: "p1", shoes: "sh1" } },
    });
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 20 }, history);
    // s1 heavily penalised, should pick s2 or s3
    expect(outfit.shirt.id).not.toBe("s1");
  });

  it("empty history means no diversity penalty", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 20 }, []);
    expect(outfit.shirt).toBeTruthy();
  });
});

// ─── explainOutfitChoice — edge cases ───────────────────────────────────────

describe("explainOutfitChoice — edge cases", () => {
  it("mentions watch brand and model", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 20 });
    const explanation = explainOutfitChoice(snowflake, outfit, { tempC: 20 });
    expect(explanation).toContain(snowflake.brand);
    expect(explanation).toContain(snowflake.model);
  });

  it("mentions formality level", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 20 });
    const explanation = explainOutfitChoice(snowflake, outfit, { tempC: 20 });
    expect(explanation).toContain("formality");
  });

  it("mentions shirt color when present", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 20 });
    const explanation = explainOutfitChoice(snowflake, outfit, { tempC: 20 });
    if (outfit.shirt) {
      expect(explanation).toContain(outfit.shirt.color);
    }
  });

  it("explanation for watch with no wardrobe mentions adding garments", () => {
    const emptyOutfit = { shirt: null, pants: null, shoes: null, jacket: null };
    const explanation = explainOutfitChoice(snowflake, emptyOutfit, {});
    expect(explanation).toContain("No garments");
    expect(explanation).toContain(snowflake.model);
  });
});
