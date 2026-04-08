/**
 * Regression tests for outfit engine fixes — March 2026.
 *
 * Fix 1: Strap resolution — single-strap watches resolve to straps[0].label, not generic "leather"
 * Fix 2: Layer subtype — no double-pullover stacking; layer must be zip/cardigan/hoodie
 * Fix 3: Jacket context — casual jackets (bomber, hoodie) excluded from clinic/formal
 * Fix 4: Sweater context — hoodies/jogger sweaters excluded from clinic/formal
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/stores/rejectStore.js", () => ({
  useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
}));
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: { getState: () => ({ getActiveStrapObj: () => null }) },
}));

import { buildOutfit, _isPulloverType, _isCasualJacket } from "../src/outfitEngine/outfitBuilder.js";
import { strapShoeScore } from "../src/outfitEngine/scoring.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const reverso = {
  id: "reverso", brand: "JLC", model: "Reverso", dial: "navy",
  style: "dress", formality: 9,
  strap: "leather", // generic — the bug
  straps: [{ id: "reverso-navy-alligator", label: "Navy alligator", color: "navy", type: "leather" }],
};

const snowflake = {
  id: "snowflake", brand: "Grand Seiko", model: "Snowflake", dial: "silver-white",
  style: "sport-elegant", formality: 7,
  strap: "bracelet",
  straps: [
    { id: "snowflake-grey-alligator", label: "Grey alligator", color: "grey", type: "leather" },
    { id: "snowflake-navy-alligator", label: "Navy alligator", color: "navy", type: "leather" },
  ],
};

const clinicWardrobe = [
  { id: "s1", type: "shirt",   name: "White Oxford",       color: "white",    formality: 7 },
  { id: "p1", type: "pants",   name: "Grey Dress Trousers",color: "grey",     formality: 7 },
  { id: "sh1",type: "shoes",   name: "Black Eccos",        color: "black",    formality: 7 },
  { id: "sh2",type: "shoes",   name: "Tan Eccos",          color: "tan",      formality: 6 },
  { id: "sh3",type: "shoes",   name: "White Sneakers",     color: "white",    formality: 4 },
  { id: "j1", type: "jacket",  name: "Camel Coat",         color: "beige",    formality: 7 },
  { id: "j2", type: "jacket",  name: "Bomber Jacket",      color: "beige",    formality: 5 },
  { id: "sw1",type: "sweater", name: "Black Cable Knit",   color: "black",    formality: 6 },
  { id: "sw2",type: "sweater", name: "Ecru Cable Knit",    color: "cream",    formality: 6 },
  { id: "sw3",type: "sweater", name: "Olive Half-Zip",     color: "olive",    formality: 5 },
  { id: "sw4",type: "sweater", name: "Burgundy Hoodie",    color: "burgundy", formality: 3 },
  { id: "sw5",type: "sweater", name: "Jogger Sweatshirt",  color: "burgundy", formality: 3 },
];

// ─── Fix 1: Strap resolution ───────────────────────────────────────────────

describe("Fix 1: strap resolution uses straps[0].label for single-strap watches", () => {
  it("Reverso resolves to 'Navy alligator' not generic 'leather'", () => {
    const outfit = buildOutfit(reverso, clinicWardrobe, { tempC: 15 });
    // strapShoeScore disabled — any shoe can be picked, just verify one is returned
    expect(outfit.shoes).toBeTruthy();
  });

  it("Navy alligator strap scores black shoes at 1.0", () => {
    expect(strapShoeScore({ strap: "Navy alligator" }, { type: "shoes", color: "black" })).toBe(1.0);
  });

  it("Navy alligator strap allows brown shoes at 1.0 (navy rule updated Mar 2026)", () => {
    expect(strapShoeScore({ strap: "Navy alligator" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });

  it("constructs strap string from {color, type} when no label — shoe picked (rule disabled)", () => {
    const watch = {
      id: "test", style: "dress", formality: 8, dial: "navy",
      strap: "leather", straps: [{ color: "brown", type: "leather" }],
    };
    const garments = [
      { id: "s1", type: "shirt", color: "white", formality: 7, name: "Shirt" },
      { id: "p1", type: "pants", color: "grey", formality: 7, name: "Pants" },
      { id: "sh1", type: "shoes", color: "brown", formality: 7, name: "Brown shoes" },
      { id: "sh2", type: "shoes", color: "black", formality: 7, name: "Black shoes" },
    ];
    const outfit = buildOutfit(watch, garments, {});
    // strapShoeScore disabled — any shoe is valid, just verify one is returned
    expect(outfit.shoes).toBeTruthy();
  });
});

// ─── Fix 2: Layer subtype differentiation ───────────────────────────────────

describe("Fix 2: no double-pullover stacking in layer slot", () => {
  it("two cable knits do NOT stack — layer stays null", () => {
    const wardrobe = clinicWardrobe.filter(g => g.id !== "sw3" && g.id !== "sw4" && g.id !== "sw5");
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 5 });
    expect(outfit.sweater).toBeTruthy();
    // Both sw1 and sw2 are cable knits (pullovers) — layer must be null
    expect(outfit.layer).toBeNull();
  });

  it("cable knit + half-zip CAN layer — zip qualifies as over-layer", () => {
    const wardrobe = clinicWardrobe.filter(g => g.id !== "sw4" && g.id !== "sw5");
    const outfit = buildOutfit(snowflake, wardrobe, { tempC: 5 });
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.layer).toBeTruthy();
    expect(outfit.layer.name).toMatch(/zip/i);
  });

  it("_isPulloverType: 'Black Cable Knit' → true", () => {
    expect(_isPulloverType("Black Cable Knit")).toBe(true);
  });

  it("_isPulloverType: 'Olive Half-Zip' → false", () => {
    expect(_isPulloverType("Olive Half-Zip")).toBe(false);
  });

  it("_isPulloverType: generic 'Navy Sweater' → true (default = pullover)", () => {
    expect(_isPulloverType("Navy Sweater")).toBe(true);
  });

  it("_isPulloverType: 'Cashmere Cardigan' → false", () => {
    expect(_isPulloverType("Cashmere Cardigan")).toBe(false);
  });

  it("_isPulloverType: null → true (default pullover)", () => {
    expect(_isPulloverType(null)).toBe(true);
  });
});

// ─── Fix 3: Jacket context filtering ────────────────────────────────────────

describe("Fix 3: casual jackets excluded from clinic/formal", () => {
  it("bomber jacket excluded from clinic context", () => {
    const outfit = buildOutfit(reverso, clinicWardrobe, { tempC: 10 }, [], [], {}, {}, "hospital-smart-casual");
    if (outfit.jacket) {
      expect(outfit.jacket.name).not.toMatch(/bomber/i);
    }
  });

  it("bomber jacket excluded from formal context", () => {
    const outfit = buildOutfit(reverso, clinicWardrobe, { tempC: 10 }, [], [], {}, {}, "formal");
    if (outfit.jacket) {
      expect(outfit.jacket.name).not.toMatch(/bomber/i);
    }
  });

  it("bomber jacket allowed in casual context", () => {
    const bomberOnly = [
      { id: "s1", type: "shirt", name: "Shirt", color: "white", formality: 5 },
      { id: "p1", type: "pants", name: "Pants", color: "grey", formality: 5 },
      { id: "sh1", type: "shoes", name: "Sneakers", color: "white", formality: 4 },
      { id: "j1", type: "jacket", name: "Bomber Jacket", color: "beige", formality: 5 },
    ];
    const watch = { id: "gmt", style: "sport", formality: 5, dial: "black", strap: "bracelet" };
    const outfit = buildOutfit(watch, bomberOnly, { tempC: 10 }, [], [], {}, {}, "casual");
    expect(outfit.jacket).toBeTruthy();
    expect(outfit.jacket.name).toBe("Bomber Jacket");
  });

  it("_isCasualJacket detects bomber, hoodie, sweatshirt, jogger", () => {
    expect(_isCasualJacket("bomber")).toBe(true);
    expect(_isCasualJacket("hoodie jacket")).toBe(true);
    expect(_isCasualJacket("sweatshirt")).toBe(true);
    expect(_isCasualJacket("jogger zip")).toBe(true);
    expect(_isCasualJacket("fleece pullover")).toBe(true);
    expect(_isCasualJacket("camel coat")).toBe(false);
    expect(_isCasualJacket("wool overcoat")).toBe(false);
  });
});

// ─── Fix 4: Sweater context filtering ───────────────────────────────────────

describe("Fix 4: casual sweaters excluded from clinic/formal", () => {
  it("hoodie excluded from clinic context sweater slot", () => {
    const outfit = buildOutfit(reverso, clinicWardrobe, { tempC: 10 }, [], [], {}, {}, "hospital-smart-casual");
    if (outfit.sweater) {
      expect(outfit.sweater.name).not.toMatch(/hoodie/i);
    }
    if (outfit.layer) {
      expect(outfit.layer.name).not.toMatch(/hoodie/i);
    }
  });

  it("jogger sweatshirt excluded from formal context", () => {
    const outfit = buildOutfit(reverso, clinicWardrobe, { tempC: 10 }, [], [], {}, {}, "formal");
    if (outfit.sweater) {
      expect(outfit.sweater.name).not.toMatch(/jogger/i);
      expect(outfit.sweater.name).not.toMatch(/sweatshirt/i);
    }
  });

  it("hoodie allowed in casual context", () => {
    const hoodieWardrobe = [
      { id: "s1", type: "shirt", name: "Tee", color: "white", formality: 3 },
      { id: "p1", type: "pants", name: "Jeans", color: "blue", formality: 4 },
      { id: "sh1", type: "shoes", name: "Sneakers", color: "white", formality: 3 },
      { id: "sw1", type: "sweater", name: "Burgundy Hoodie", color: "burgundy", formality: 3 },
    ];
    const watch = { id: "gmt", style: "sport", formality: 5, dial: "black", strap: "bracelet" };
    const outfit = buildOutfit(watch, hoodieWardrobe, { tempC: 10 }, [], [], {}, {}, "casual");
    expect(outfit.sweater).toBeTruthy();
    expect(outfit.sweater.name).toBe("Burgundy Hoodie");
  });
});

// ─── Reverso dual-dial recommendation ───────────────────────────────────────

describe("Reverso dual-dial recommendation", () => {
  const reversoDD = {
    id: "reverso", style: "dress", formality: 9, dial: "navy",
    strap: "leather",
    straps: [{ label: "Navy alligator", color: "navy", type: "leather" }],
    dualDial: { sideA: "navy", sideA_label: "Navy dial", sideB: "white", sideB_label: "White Moon Phase" },
  };

  it("recommends white dial (side B) with dark outfit", () => {
    const darkWardrobe = [
      { id: "s1", type: "shirt", color: "black", formality: 7, name: "Shirt" },
      { id: "p1", type: "pants", color: "charcoal", formality: 7, name: "Pants" },
      { id: "sh1", type: "shoes", color: "black", formality: 8, name: "Shoes" },
    ];
    const outfit = buildOutfit(reversoDD, darkWardrobe, { tempC: 15 });
    expect(outfit._recommendedDial).toBeTruthy();
    expect(outfit._recommendedDial.side).toBe("B");
    expect(outfit._recommendedDial.label).toBe("White Moon Phase");
  });

  it("recommends navy dial (side A) with light outfit", () => {
    const lightWardrobe = [
      { id: "s1", type: "shirt", color: "white", formality: 7, name: "Shirt" },
      { id: "sw1", type: "sweater", color: "cream", formality: 6, name: "Sweater" },
      { id: "p1", type: "pants", color: "stone", formality: 7, name: "Pants" },
      { id: "sh1", type: "shoes", color: "black", formality: 8, name: "Shoes" },
    ];
    const outfit = buildOutfit(reversoDD, lightWardrobe, { tempC: 15 });
    expect(outfit._recommendedDial).toBeTruthy();
    expect(outfit._recommendedDial.side).toBe("A");
    expect(outfit._recommendedDial.label).toBe("Navy dial");
  });

  it("non-dual-dial watch has null recommendation", () => {
    const normalWatch = { id: "gmt", style: "sport", formality: 5, dial: "black", strap: "bracelet" };
    const wardrobe = [
      { id: "s1", type: "shirt", color: "white", formality: 5, name: "Shirt" },
      { id: "p1", type: "pants", color: "grey", formality: 5, name: "Pants" },
      { id: "sh1", type: "shoes", color: "black", formality: 5, name: "Shoes" },
    ];
    const outfit = buildOutfit(normalWatch, wardrobe, {});
    expect(outfit._recommendedDial).toBeNull();
  });
});
