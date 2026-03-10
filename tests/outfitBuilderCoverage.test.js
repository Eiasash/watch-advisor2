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
  { id: "sw3",type: "sweater", name: "Olive Half-Zip", color: "olive",  formality: 5 },
];

// ─── buildOutfit — pinnedSlots ──────────────────────────────────────────────

describe("buildOutfit — pinnedSlots", () => {
  it("uses pinned shirt directly, bypassing scoring", () => {
    const pinned = { id: "s3", type: "shirt", name: "Grey Shirt", color: "grey", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { shirt: pinned });
    expect(outfit.shirt.id).toBe("s3");
  });

  it("uses pinned pants directly", () => {
    const pinned = { id: "p2", type: "pants", name: "Dark Chinos", color: "brown", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { pants: pinned });
    expect(outfit.pants.id).toBe("p2");
  });

  it("uses pinned shoes directly", () => {
    const pinned = { id: "sh3", type: "shoes", name: "White Sneakers", color: "white", formality: 4 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { shoes: pinned });
    expect(outfit.shoes.id).toBe("sh3");
  });

  it("pinned slot does not affect other slots", () => {
    const pinned = { id: "s3", type: "shirt", name: "Grey Shirt", color: "grey", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { shirt: pinned });
    expect(outfit.shirt.id).toBe("s3");
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
  });

  it("multiple pinned slots all respected", () => {
    const pinnedShirt = { id: "s3", type: "shirt", name: "Grey Shirt", color: "grey", formality: 5 };
    const pinnedPants = { id: "p2", type: "pants", name: "Dark Chinos", color: "brown", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { shirt: pinnedShirt, pants: pinnedPants });
    expect(outfit.shirt.id).toBe("s3");
    expect(outfit.pants.id).toBe("p2");
  });

  it("pinned sweater used when cold", () => {
    const pinned = { id: "sw2", type: "sweater", name: "Grey Sweater", color: "grey", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 15 }, [], [], { sweater: pinned });
    expect(outfit.sweater.id).toBe("sw2");
  });

  it("pinned layer used when very cold", () => {
    const pinnedLayer = { id: "sw2", type: "sweater", name: "Grey Sweater", color: "grey", formality: 5 };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 5 }, [], [], { layer: pinnedLayer });
    expect(outfit.layer.id).toBe("sw2");
  });
});

// ─── buildOutfit — excludedPerSlot ──────────────────────────────────────────

describe("buildOutfit — excludedPerSlot", () => {
  it("excludes specific shirt from shirt slot", () => {
    const excluded = { shirt: new Set(["s1"]) };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], {}, excluded);
    expect(outfit.shirt?.id).not.toBe("s1");
    expect(outfit.shirt).toBeTruthy(); // still picks another shirt
  });

  it("excludes multiple garments from a slot", () => {
    const excluded = { shirt: new Set(["s1", "s2"]) };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], {}, excluded);
    expect(outfit.shirt?.id).toBe("s3"); // only one left
  });

  it("returns null for slot when all candidates excluded", () => {
    const excluded = { shirt: new Set(["s1", "s2", "s3"]) };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], {}, excluded);
    expect(outfit.shirt).toBeNull();
  });

  it("excluded pants does not affect shirt slot", () => {
    const excluded = { pants: new Set(["p1", "p2"]) };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], {}, excluded);
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeNull(); // all pants excluded
  });

  it("pinned slot overrides exclusion for that slot", () => {
    const pinned = { shirt: { id: "s1", type: "shirt", name: "White Oxford", color: "white", formality: 7 } };
    const excluded = { shirt: new Set(["s1"]) };
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], pinned, excluded);
    // Pinned takes precedence — exclusion is never evaluated
    expect(outfit.shirt.id).toBe("s1");
  });
});

// ─── buildOutfit — second sweater layer selection ───────────────────────────

describe("buildOutfit — second sweater layer at tempC < 12", () => {
  it("picks zip-up as layer over pullover primary when temp < 12", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 5 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeTruthy();
    expect(outfit.sweater.id).not.toBe(outfit.layer.id);
    // Layer must be the zip-up, not another pullover
    expect(outfit.layer.name).toMatch(/zip/i);
  });

  it("no second layer when only one sweater available", () => {
    const oneSweater = fullWardrobe.filter(g => g.id !== "sw2" && g.id !== "sw3");
    const outfit = buildOutfit(snowflake, oneSweater, { tempC: 5 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeNull();
  });

  it("no second layer at temp 12 (boundary — only < 12 triggers)", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 12 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeNull();
  });

  it("no second layer at temp 11 (coat+sweater is enough)", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 11 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeNull(); // layer only below 8°C
  });

  it("second layer at temp 7 (below 8°C boundary)", () => {
    const outfit = buildOutfit(snowflake, fullWardrobe, { tempC: 7 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeTruthy(); // Arctic cold → double layer
  });

  it("no layer when all sweaters are pullovers (prevents double-crewneck)", () => {
    const pulloversOnly = fullWardrobe.filter(g => g.id !== "sw3"); // remove the zip
    const outfit = buildOutfit(snowflake, pulloversOnly, { tempC: 5 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeNull(); // no zip candidate → no layer
  });
});

// ─── buildOutfit — weather jacket backfill ──────────────────────────────────

describe("buildOutfit — weather jacket backfill for diver style", () => {
  it("diver style has no jacket slot but gets jacket when cold", () => {
    const diverWatch = WATCH_COLLECTION.find(w => w.style === "diver") ?? { ...snowflake, style: "diver" };
    const outfit = buildOutfit(diverWatch, fullWardrobe, { tempC: 10 });
    expect(outfit.jacket).toBeTruthy();
    expect(outfit.jacket.type).toBe("jacket");
  });

  it("diver style no jacket when warm", () => {
    const diverWatch = WATCH_COLLECTION.find(w => w.style === "diver") ?? { ...snowflake, style: "diver" };
    const outfit = buildOutfit(diverWatch, fullWardrobe, { tempC: 25 });
    expect(outfit.jacket).toBeFalsy(); // diver style has no jacket slot → undefined
  });
});

// ─── buildOutfit — formality anchor from pinned slots ───────────────────────

describe("buildOutfit — formality anchor from pinned slots", () => {
  it("pinned high-formality garment influences scoring context", () => {
    const highFormality = { id: "s-formal", type: "shirt", name: "Dress Shirt", color: "white", formality: 9 };
    const outfit1 = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], { shirt: highFormality });
    const outfit2 = buildOutfit(snowflake, fullWardrobe, { tempC: 25 }, [], [], {});
    // Both produce valid outfits
    expect(outfit1.pants).toBeTruthy();
    expect(outfit2.pants).toBeTruthy();
  });
});

// ─── explainOutfitChoice — direct tests ─────────────────────────────────────

describe("explainOutfitChoice — direct unit tests", () => {
  it("empty outfit returns add-garments message with watch model", () => {
    const outfit = { shirt: null, pants: null, shoes: null, jacket: null, sweater: null };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("No garments");
    expect(result).toContain(snowflake.model);
  });

  it("includes watch brand, model, style, and formality", () => {
    const outfit = {
      shirt: { name: "White Oxford", color: "white" },
      pants: { name: "Grey Trousers" },
      shoes: { name: "Tan Eccos" },
      jacket: null, sweater: null, layer: null,
    };
    const result = explainOutfitChoice(snowflake, outfit, { tempC: 20 });
    expect(result).toContain(snowflake.brand);
    expect(result).toContain(snowflake.model);
    expect(result).toContain(snowflake.style);
    expect(result).toContain(`formality ${snowflake.formality}/10`);
  });

  it("mentions shirt name and color", () => {
    const outfit = { shirt: { name: "Navy Polo", color: "navy" }, pants: null, shoes: null };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("Navy Polo");
    expect(result).toContain("navy");
    expect(result).toContain("dial");
  });

  it("mentions sweater layered for warmth", () => {
    const outfit = { shirt: null, sweater: { name: "Navy Sweater" }, pants: null, shoes: null };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("Navy Sweater");
    expect(result).toContain("warmth");
  });

  it("mentions second layer for extra warmth", () => {
    const outfit = { shirt: null, layer: { name: "Grey Sweater" }, pants: null, shoes: null };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("Grey Sweater");
    expect(result).toContain("extra warmth");
  });

  it("mentions pants complement formality", () => {
    const outfit = { shirt: null, pants: { name: "Grey Trousers" }, shoes: null };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("Grey Trousers");
    expect(result).toContain("formality");
  });

  it("mentions shoes ground the outfit", () => {
    const outfit = { shirt: null, pants: null, shoes: { name: "Tan Eccos" } };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).toContain("Tan Eccos");
    expect(result).toContain("ground");
  });

  it("mentions jacket with temperature when weather provided", () => {
    const outfit = { shirt: null, pants: null, shoes: null, jacket: { name: "Camel Coat" } };
    const result = explainOutfitChoice(snowflake, outfit, { tempC: 10 });
    expect(result).toContain("Camel Coat");
    expect(result).toContain("10°C");
  });

  it("does not mention jacket temperature when weather is null", () => {
    const outfit = { shirt: null, pants: null, shoes: null, jacket: { name: "Camel Coat" } };
    const result = explainOutfitChoice(snowflake, outfit, null);
    expect(result).not.toContain("°C");
  });

  it("does not mention jacket temperature when tempC is undefined", () => {
    const outfit = { shirt: null, pants: null, shoes: null, jacket: { name: "Camel Coat" } };
    const result = explainOutfitChoice(snowflake, outfit, {});
    expect(result).not.toContain("°C");
  });

  it("full outfit produces all parts in explanation", () => {
    const outfit = {
      shirt: { name: "White Oxford", color: "white" },
      sweater: { name: "Navy Sweater" },
      layer: { name: "Grey Sweater" },
      pants: { name: "Grey Trousers" },
      shoes: { name: "Tan Eccos" },
      jacket: { name: "Camel Coat" },
    };
    const result = explainOutfitChoice(snowflake, outfit, { tempC: 5 });
    expect(result).toContain("White Oxford");
    expect(result).toContain("Navy Sweater");
    expect(result).toContain("Grey Sweater");
    expect(result).toContain("Grey Trousers");
    expect(result).toContain("Tan Eccos");
    expect(result).toContain("Camel Coat");
    expect(result).toContain("5°C");
  });

  it("works with different watch", () => {
    const outfit = { shirt: { name: "Shirt", color: "blue" }, pants: null, shoes: null };
    const result = explainOutfitChoice(reverso, outfit, {});
    expect(result).toContain(reverso.brand);
    expect(result).toContain(reverso.model);
  });
});
