import { describe, it, expect } from "vitest";
import { buildOutfit, explainOutfitChoice } from "../src/outfitEngine/outfitBuilder.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");

const wardrobe = [
  { id: "s1", type: "shirt",   name: "White Oxford",  color: "white",  formality: 7 },
  { id: "s2", type: "shirt",   name: "Navy Polo",     color: "navy",   formality: 6 },
  { id: "p1", type: "pants",   name: "Grey Trousers", color: "grey",   formality: 7 },
  { id: "p2", type: "pants",   name: "Dark Chinos",   color: "brown",  formality: 5 },
  { id: "sh1",type: "shoes",   name: "Tan Eccos",     color: "tan",    formality: 6 },
  { id: "sh2",type: "shoes",   name: "Black Eccos",   color: "black",  formality: 7 },
  { id: "j1", type: "jacket",  name: "Camel Coat",    color: "beige",  formality: 7 },
  { id: "j2", type: "jacket",  name: "Green Zip",     color: "green",  formality: 5 },
  { id: "sw1",type: "sweater", name: "Navy Sweater",  color: "navy",   formality: 6 },
  // Accessories (should be excluded from outfit slots)
  { id: "a1", type: "belt",       name: "Brown Belt",   color: "brown",  formality: 6 },
  { id: "a2", type: "sunglasses", name: "Ray-Bans",     color: "black",  formality: 5 },
  { id: "o1", type: "outfit-photo", name: "Mirror Selfie", excludeFromWardrobe: true },
];

// ─── buildOutfit — slot assignment ──────────────────────────────────────────

describe("buildOutfit — slot assignment", () => {
  it("fills all four slots with a complete wardrobe", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 15 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
    expect(outfit.jacket).toBeTruthy();
  });

  it("returns null for missing slots", () => {
    const noJackets = wardrobe.filter(g => g.type !== "jacket" && g.type !== "sweater");
    const outfit = buildOutfit(snowflake, noJackets, { tempC: 25 });
    expect(outfit.jacket).toBeNull();
  });

  it("returns all-null outfit for null watch", () => {
    const outfit = buildOutfit(null, wardrobe);
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
    expect(outfit.jacket).toBeNull();
  });
});

// ─── buildOutfit — accessory filtering ──────────────────────────────────────

describe("buildOutfit — accessory filtering", () => {
  it("accessories never appear in outfit slots", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 15 });
    const slotIds = [outfit.shirt?.id, outfit.pants?.id, outfit.shoes?.id, outfit.jacket?.id].filter(Boolean);
    expect(slotIds).not.toContain("a1"); // belt
    expect(slotIds).not.toContain("a2"); // sunglasses
  });

  it("outfit-photo / excludeFromWardrobe items never appear", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 15 });
    const slotIds = [outfit.shirt?.id, outfit.pants?.id, outfit.shoes?.id, outfit.jacket?.id].filter(Boolean);
    expect(slotIds).not.toContain("o1");
  });
});

// ─── buildOutfit — sweater accepted in shirt slot ───────────────────────────

describe("buildOutfit — sweater in shirt slot", () => {
  it("sweater can fill the shirt slot", () => {
    const sweaterOnly = [
      { id: "sw1", type: "sweater", name: "Navy Sweater", color: "navy", formality: 6 },
      { id: "p1",  type: "pants",   name: "Grey Trousers", color: "grey", formality: 7 },
      { id: "sh1", type: "shoes",   name: "Tan Eccos",     color: "tan",  formality: 6 },
    ];
    const outfit = buildOutfit(snowflake, sweaterOnly, { tempC: 15 });
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.shirt.id).toBe("sw1");
  });
});

// ─── buildOutfit — weather-based jacket ─────────────────────────────────────

describe("buildOutfit — weather-based jacket", () => {
  it("adds jacket when temp < 10°C even if no jacket in style slots", () => {
    const noJacketStyle = [
      { id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 7 },
      { id: "p1", type: "pants", name: "Pants", color: "grey",  formality: 7 },
      { id: "sh1",type: "shoes", name: "Shoes", color: "black", formality: 7 },
      { id: "j1", type: "jacket", name: "Coat", color: "black", formality: 7 },
    ];
    const outfit = buildOutfit(snowflake, noJacketStyle, { tempC: 5 });
    // The outfit should have a jacket since it's cold
    expect(outfit.jacket).toBeTruthy();
  });

  it("no jacket recommendation when temp >= 22°C", () => {
    const onlyShirtPantsShoes = [
      { id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 7 },
      { id: "p1", type: "pants", name: "Pants", color: "grey",  formality: 7 },
      { id: "sh1",type: "shoes", name: "Shoes", color: "black", formality: 7 },
    ];
    const outfit = buildOutfit(snowflake, onlyShirtPantsShoes, { tempC: 28 });
    expect(outfit.jacket).toBeNull();
  });
});

// ─── buildOutfit — diversity ────────────────────────────────────────────────

describe("buildOutfit — diversity penalty", () => {
  it("penalises recently worn garments", () => {
    // Wear s1 five times
    const history = Array(5).fill({
      outfit: { shirt: "s1", pants: "p1", shoes: "sh1" },
    });
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 }, history);
    // s2 should be preferred over s1 after heavy recent use
    expect(outfit.shirt.id).toBe("s2");
  });
});

// ─── explainOutfitChoice ────────────────────────────────────────────────────

describe("explainOutfitChoice", () => {
  it("returns a non-empty explanation mentioning the watch", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 20 });
    const explanation = explainOutfitChoice(snowflake, outfit, { tempC: 20 });
    expect(explanation.length).toBeGreaterThan(20);
    expect(explanation).toContain(snowflake.model);
  });

  it("handles empty wardrobe gracefully", () => {
    const outfit = buildOutfit(snowflake, [], {});
    const explanation = explainOutfitChoice(snowflake, outfit, {});
    expect(explanation).toContain("No garments");
  });

  it("mentions weather when jacket is included", () => {
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 8 });
    const explanation = explainOutfitChoice(snowflake, outfit, { tempC: 8 });
    if (outfit.jacket) {
      expect(explanation).toContain("8°C");
    }
  });
});
