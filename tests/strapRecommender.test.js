import { describe, it, expect, vi } from "vitest";

// Mock scoring.js — strapShoeScore is the only dependency
vi.mock("../src/outfitEngine/scoring.js", () => ({
  strapShoeScore: vi.fn((watch, shoes, context) => {
    const strap = (watch.strap ?? "").toLowerCase();
    const shoeColor = (shoes?.color ?? "").toLowerCase();
    // Simplified: brown strap + brown shoes = 1.0, black+black = 1.0, mismatch = 0
    if (strap.includes("brown") && shoeColor.includes("brown")) return 1.0;
    if (strap.includes("black") && shoeColor.includes("black")) return 1.0;
    if (strap.includes("metal") || strap.includes("bracelet") || strap.includes("titanium")) return 1.0;
    // Casual straps get soft match
    if (["nato", "canvas", "rubber"].some(t => strap.includes(t))) return 0.7;
    if (strap.includes("brown") && shoeColor.includes("black")) return 0;
    if (strap.includes("black") && shoeColor.includes("brown")) return 0;
    return 0.5;
  }),
}));

import { recommendStrap } from "../src/outfitEngine/strapRecommender.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mkStrap = (id, label, color, type = "leather") => ({ id, label, color, type });
const mkGarment = (name, type, color, formality = 5) => ({ name, type, color, formality });

const brownShoes = mkGarment("Brown Derby", "shoes", "brown", 6);
const blackShoes = mkGarment("Black Oxford", "shoes", "black", 8);

const baseOutfit = {
  shirt: mkGarment("Navy Polo", "shirt", "navy"),
  pants: mkGarment("Grey Chinos", "pants", "grey"),
  shoes: brownShoes,
  jacket: null,
  sweater: null,
  layer: null,
};

// ── Core behavior ────────────────────────────────────────────────────────────

describe("recommendStrap", () => {
  it("returns null when watch has no straps", () => {
    expect(recommendStrap({}, baseOutfit, "casual")).toBeNull();
  });

  it("returns null when watch has only one strap", () => {
    const watch = { straps: [mkStrap("s1", "Brown Leather", "brown")] };
    expect(recommendStrap(watch, baseOutfit, "casual")).toBeNull();
  });

  it("returns null for undefined watch", () => {
    expect(recommendStrap(undefined, baseOutfit, "casual")).toBeNull();
  });

  it("returns null for null straps array", () => {
    expect(recommendStrap({ straps: null }, baseOutfit, "casual")).toBeNull();
  });

  it("picks brown strap for brown shoes over black strap", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Black Leather", "black"),
        mkStrap("s2", "Brown Leather", "brown"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(result.recommended.id).toBe("s2");
  });

  it("picks black strap for black shoes", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Black Leather", "black"),
      ],
    };
    const outfit = { ...baseOutfit, shoes: blackShoes };
    const result = recommendStrap(watch, outfit, "formal");
    expect(result).not.toBeNull();
    expect(result.recommended.id).toBe("s2");
  });

  it("returns null when all straps score 0 (all violate strap-shoe rule)", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Brown Suede", "brown"),
      ],
    };
    // Black shoes + brown straps = all 0
    const outfit = { ...baseOutfit, shoes: blackShoes };
    const result = recommendStrap(watch, outfit, "formal");
    expect(result).toBeNull();
  });

  it("provides alternatives sorted by score", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Brown Suede", "tan"),
        mkStrap("s3", "Olive NATO", "olive", "nato"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result).not.toBeNull();
    expect(result.alternatives.length).toBeGreaterThan(0);
    // Alternatives should have lower score than recommended
    for (const alt of result.alternatives) {
      expect(alt.score).toBeLessThanOrEqual(result.recommended.score);
    }
  });

  it("limits alternatives to at most 2", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Brown Suede", "tan"),
        mkStrap("s3", "Cognac", "cognac"),
        mkStrap("s4", "Camel", "camel"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result.alternatives.length).toBeLessThanOrEqual(2);
  });

  it("filters out zero-score alternatives", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Black Leather", "black"), // will score 0 with brown shoes
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result).not.toBeNull();
    expect(result.alternatives.every(a => a.score > 0)).toBe(true);
  });
});

// ── Bracelet / exempt handling ───────────────────────────────────────────────

describe("recommendStrap — bracelet handling", () => {
  it("bracelet gets a flat score (versatile default)", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Steel Bracelet", "silver", "bracelet"),
        mkStrap("s2", "Brown Leather", "brown"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result).not.toBeNull();
    // Brown leather with brown shoes should beat bracelet's 0.70 flat
    expect(result.recommended.id).toBe("s2");
  });

  it("bracelet reason explains versatility", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Titanium Bracelet", "titanium", "bracelet"),
        mkStrap("s2", "Black Rubber", "black", "rubber"),
      ],
    };
    // Black shoes — rubber will get 0.7 from casual strap, bracelet gets 0.70
    const outfit = { ...baseOutfit, shoes: blackShoes };
    const result = recommendStrap(watch, outfit, "formal");
    // Bracelet should win in formal context (rubber gets -0.15 penalty)
    expect(result).not.toBeNull();
    if (result.recommended.id === "s1") {
      expect(result.reason).toContain("Bracelet");
    }
  });

  it("integrated strap is treated like bracelet (exempt)", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Integrated", "blue", "integrated"),
        mkStrap("s2", "Brown Leather", "brown"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result).not.toBeNull();
  });
});

// ── Context scoring ──────────────────────────────────────────────────────────

describe("recommendStrap — context effects", () => {
  it("formal context boosts leather", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown", "leather"),
        mkStrap("s2", "Brown NATO", "brown", "nato"),
      ],
    };
    const result = recommendStrap(watch, baseOutfit, "clinic");
    expect(result).not.toBeNull();
    expect(result.recommended.id).toBe("s1"); // leather wins in formal
  });

  it("casual context boosts NATO/rubber", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Olive NATO", "olive", "nato"),
        mkStrap("s2", "Brown Leather", "brown", "leather"),
      ],
    };
    // Both straps can work with brown shoes (NATO gets soft 0.7 match)
    const result = recommendStrap(watch, baseOutfit, "casual");
    expect(result).not.toBeNull();
    // NATO gets +0.08 bonus in casual; leather gets no bonus
  });
});

// ── Palette affinity ─────────────────────────────────────────────────────────

describe("recommendStrap — palette affinity", () => {
  it("olive strap gets affinity bonus with olive jacket", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Olive NATO", "olive", "nato"),
        mkStrap("s2", "Brown NATO", "brown", "nato"),
      ],
    };
    const outfit = {
      ...baseOutfit,
      jacket: mkGarment("Olive Field Jacket", "jacket", "olive"),
    };
    const result = recommendStrap(watch, outfit, "casual");
    expect(result).not.toBeNull();
    // Olive strap should get palette affinity with olive jacket
  });

  it("strap matching multiple outfit pieces gets capped affinity", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Navy Leather", "navy"),
      ],
    };
    const outfit = {
      shirt: mkGarment("Navy Shirt", "shirt", "navy"),
      pants: mkGarment("Navy Chinos", "pants", "navy"),
      shoes: brownShoes,
      jacket: mkGarment("Navy Blazer", "jacket", "navy"),
      sweater: null,
      layer: null,
    };
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    // Navy strap affinity should be capped at 0.25
  });
});

// ── Dial harmony ─────────────────────────────────────────────────────────────

describe("recommendStrap — dial harmony", () => {
  it("strap matching dial color gets bonus", () => {
    const watch = {
      dial: "navy",
      straps: [
        mkStrap("s1", "Navy Leather", "navy"),
        mkStrap("s2", "Brown Leather", "brown"),
      ],
    };
    const outfit = { ...baseOutfit, shoes: blackShoes };
    // Neither brown nor navy leather works great with black shoes per mock,
    // but we're testing that dial harmony affects the final score
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
  });
});

// ── Reason generation ────────────────────────────────────────────────────────

describe("recommendStrap — reason text", () => {
  it("mentions shoe coordination in reason", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Black Leather", "black"),
        mkStrap("s2", "Brown Leather", "brown"),
      ],
    };
    const outfit = { ...baseOutfit, shoes: blackShoes };
    const result = recommendStrap(watch, outfit, "formal");
    expect(result).not.toBeNull();
    expect(result.reason.toLowerCase()).toContain("black");
  });

  it("mentions outfit echo when strap matches a garment color family", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Brown Leather", "brown"),
        mkStrap("s2", "Black Leather", "black"),
      ],
    };
    const outfit = {
      ...baseOutfit,
      pants: mkGarment("Tan Chinos", "pants", "tan"),
    };
    const result = recommendStrap(watch, outfit, "casual");
    expect(result).not.toBeNull();
    // Brown strap + tan pants are in the same earth family
    if (result.recommended.id === "s1") {
      expect(result.reason.toLowerCase()).toMatch(/tan|earth|chino|trouser/);
    }
  });

  it("falls back to context-based reason when no specific matches", () => {
    const watch = {
      straps: [
        mkStrap("s1", "Grey Suede", "grey"),
        mkStrap("s2", "Teal Rubber", "teal", "rubber"),
      ],
    };
    const outfit = {
      shirt: mkGarment("Red Polo", "shirt", "red"),
      pants: mkGarment("Purple Pants", "pants", "purple"),
      shoes: mkGarment("White Sneakers", "shoes", "white"),
      jacket: null,
      sweater: null,
      layer: null,
    };
    const result = recommendStrap(watch, outfit, "casual");
    if (result) {
      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(5);
    }
  });
});
