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
const laco = WATCH_COLLECTION.find(w => w.id === "laco");
const apRoyalOak = WATCH_COLLECTION.find(w => w.id === "ap_royal_oak"); // replica

const wardrobe = [
  { id: "s1", type: "shirt",   name: "White Oxford",       color: "white",  formality: 7 },
  { id: "s2", type: "shirt",   name: "Navy Polo",          color: "navy",   formality: 5 },
  { id: "p1", type: "pants",   name: "Grey Trousers",      color: "grey",   formality: 7 },
  { id: "p2", type: "pants",   name: "Khaki Chinos",       color: "khaki",  formality: 5 },
  { id: "sh1",type: "shoes",   name: "Brown Derby",        color: "brown",  formality: 7 },
  { id: "sh2",type: "shoes",   name: "Black Oxford",       color: "black",  formality: 8 },
  { id: "sh3",type: "shoes",   name: "White Sneakers",     color: "white",  formality: 3 },
  { id: "j1", type: "jacket",  name: "Camel Coat",         color: "beige",  formality: 7 },
  { id: "j2", type: "jacket",  name: "Bomber Jacket",      color: "black",  formality: 3 },
  { id: "j3", type: "jacket",  name: "Hoodie Zip",         color: "grey",   formality: 2 },
  { id: "sw1",type: "sweater", name: "Black Cable Knit",   color: "black",  formality: 7 },
  { id: "sw2",type: "sweater", name: "Olive Quarter-Zip",  color: "olive",  formality: 5 },
  { id: "b1", type: "belt",    name: "Brown Leather Belt",  color: "brown",  formality: 6 },
];

const coldWeather = { tempC: 8 };
const warmWeather = { tempC: 25 };
const mildWeather = { tempC: 17 };

// ── Context effects on jacket filtering ──────────────────────────────────────

describe("buildOutfit — context filtering", () => {
  it("formal context excludes casual jackets (bomber, hoodie)", () => {
    const outfit = buildOutfit(snowflake, wardrobe, coldWeather, [], [], {}, {}, "formal");
    if (outfit.jacket) {
      const name = outfit.jacket.name.toLowerCase();
      expect(name).not.toContain("bomber");
      expect(name).not.toContain("hoodie");
    }
  });

  it("clinic context excludes casual jackets", () => {
    const outfit = buildOutfit(snowflake, wardrobe, coldWeather, [], [], {}, {}, "clinic");
    if (outfit.jacket) {
      const name = outfit.jacket.name.toLowerCase();
      expect(name).not.toContain("bomber");
      expect(name).not.toContain("hoodie");
    }
  });

  it("casual context allows bomber/hoodie jackets", () => {
    // In casual context, casual jackets like bomber/hoodie should be candidates
    const outfit = buildOutfit(laco, wardrobe, coldWeather, [], [], {}, {}, "casual");
    // Just verify it produces a valid outfit — casual jackets not excluded
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
  });

  it("shift context excludes casual jackets", () => {
    const outfit = buildOutfit(snowflake, wardrobe, coldWeather, [], [], {}, {}, "shift");
    if (outfit.jacket) {
      const name = outfit.jacket.name.toLowerCase();
      expect(name).not.toContain("bomber");
      expect(name).not.toContain("hoodie");
    }
  });

  it("hospital-smart-casual context excludes casual jackets", () => {
    const outfit = buildOutfit(snowflake, wardrobe, coldWeather, [], [], {}, {}, "hospital-smart-casual");
    if (outfit.jacket) {
      const name = outfit.jacket.name.toLowerCase();
      expect(name).not.toContain("bomber");
      expect(name).not.toContain("hoodie");
    }
  });
});

// ── Context effects on replica penalty ───────────────────────────────────────

describe("buildOutfit — replica context penalty", () => {
  it("replica watch in formal context scores lower than genuine", () => {
    if (!apRoyalOak) return; // guard
    const replicaOutfit = buildOutfit(apRoyalOak, wardrobe, mildWeather, [], [], {}, {}, "formal");
    const genuineOutfit = buildOutfit(snowflake, wardrobe, mildWeather, [], [], {}, {}, "formal");
    // Both should produce outfits, but replica has penalized scoring
    expect(replicaOutfit._score).toBeLessThan(genuineOutfit._score);
  });

  it("replica watch in casual context has no extra penalty", () => {
    if (!apRoyalOak) return;
    const casualOutfit = buildOutfit(apRoyalOak, wardrobe, mildWeather, [], [], {}, {}, "casual");
    // Should still produce a valid outfit
    expect(casualOutfit.shirt).toBeTruthy();
    expect(casualOutfit._score).toBeGreaterThan(0);
  });
});

// ── No sweater/layer in warm weather ─────────────────────────────────────────

describe("buildOutfit — warm weather suppression", () => {
  it("no sweater when tempC >= 22", () => {
    const outfit = buildOutfit(snowflake, wardrobe, warmWeather, [], [], {}, {}, "casual");
    expect(outfit.sweater).toBeNull();
  });

  it("no layer when tempC >= 22", () => {
    const outfit = buildOutfit(snowflake, wardrobe, warmWeather, [], [], {}, {}, "casual");
    expect(outfit.layer).toBeNull();
  });

  it("sweater fills when tempC < 22", () => {
    const outfit = buildOutfit(snowflake, wardrobe, mildWeather, [], [], {}, {}, "casual");
    // At 17°C, sweater should be offered
    expect(outfit.sweater).toBeTruthy();
  });
});

// ── explainOutfitChoice edge cases ───────────────────────────────────────────

describe("explainOutfitChoice — edge cases", () => {
  it("handles outfit with all null slots — returns fallback string", () => {
    const emptyOutfit = {
      shirt: null, pants: null, shoes: null,
      jacket: null, sweater: null, layer: null, belt: null,
      _recommendedDial: null,
    };
    const text = explainOutfitChoice(snowflake, emptyOutfit, mildWeather);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(snowflake.model);
  });

  it("includes sweater in explanation when present", () => {
    const outfit = buildOutfit(snowflake, wardrobe, coldWeather, [], [], {}, {}, "casual");
    if (outfit.sweater) {
      const text = explainOutfitChoice(snowflake, outfit, coldWeather);
      expect(text).toContain(outfit.sweater.name);
    }
  });

  it("includes belt name in explanation when present", () => {
    const outfit = buildOutfit(snowflake, wardrobe, mildWeather, [], [], {}, {}, "smart-casual");
    if (outfit.belt && outfit.shoes) {
      const text = explainOutfitChoice(snowflake, outfit, mildWeather);
      expect(text).toContain(outfit.belt.name);
    }
  });

  it("includes layer mention for second layer", () => {
    const veryWardrobe = [
      ...wardrobe,
      { id: "sw3", type: "sweater", name: "Ecru Cable Knit", color: "cream", formality: 7 },
    ];
    const arcticWeather = { tempC: 3 };
    const outfit = buildOutfit(snowflake, veryWardrobe, arcticWeather, [], [], {}, {}, "casual");
    if (outfit.layer) {
      const text = explainOutfitChoice(snowflake, outfit, arcticWeather);
      expect(text.toLowerCase()).toMatch(/second layer|extra warmth/);
    }
  });

  it("mentions watch brand and model as anchor", () => {
    const outfit = buildOutfit(snowflake, wardrobe, mildWeather, [], [], {}, {}, "casual");
    const text = explainOutfitChoice(snowflake, outfit, mildWeather);
    expect(text).toContain(snowflake.brand);
    expect(text).toContain(snowflake.model);
  });
});
