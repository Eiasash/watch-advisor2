import { describe, it, expect } from "vitest";

// ── Replicated pure filter logic from WardrobeGrid.jsx ───────────────────────

const TYPE_FILTER = {
  all:     () => true,
  tops:    g => ["shirt","sweater","polo","tee","flannel","crewneck","cardigan","hoodie","overshirt"].includes(g.type),
  bottoms: g => ["pants","jeans","chinos","shorts","joggers","corduroy"].includes(g.type),
  shoes:   g => ["shoes","boots","sneakers","loafers","sandals"].includes(g.type),
  layers:  g => ["jacket","coat","blazer","bomber","vest"].includes(g.type),
  extras:  g => ["belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type),
  review:  g => g.needsReview,
};

function searchFilter(garments, query) {
  const q = query.trim().toLowerCase();
  if (!q) return garments;
  return garments.filter(g =>
    (g.name ?? "").toLowerCase().includes(q) ||
    (g.type ?? "").toLowerCase().includes(q) ||
    (g.color ?? "").toLowerCase().includes(q) ||
    (g.brand ?? "").toLowerCase().includes(q)
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function g(type, extra = {}) { return { type, ...extra }; }

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WardrobeGrid — TYPE_FILTER", () => {
  describe("tops filter", () => {
    it("includes shirt", () => {
      expect(TYPE_FILTER.tops(g("shirt"))).toBe(true);
    });

    it("includes sweater, polo, tee, flannel, crewneck, cardigan, hoodie, overshirt", () => {
      const topTypes = ["sweater","polo","tee","flannel","crewneck","cardigan","hoodie","overshirt"];
      topTypes.forEach(t => {
        expect(TYPE_FILTER.tops(g(t))).toBe(true);
      });
    });

    it("excludes pants", () => {
      expect(TYPE_FILTER.tops(g("pants"))).toBe(false);
    });
  });

  describe("bottoms filter", () => {
    it("includes pants, jeans, chinos, shorts, joggers, corduroy", () => {
      const bottomTypes = ["pants","jeans","chinos","shorts","joggers","corduroy"];
      bottomTypes.forEach(t => {
        expect(TYPE_FILTER.bottoms(g(t))).toBe(true);
      });
    });

    it("excludes shirt", () => {
      expect(TYPE_FILTER.bottoms(g("shirt"))).toBe(false);
    });
  });

  describe("shoes filter", () => {
    it("includes shoes, boots, sneakers, loafers, sandals", () => {
      const shoeTypes = ["shoes","boots","sneakers","loafers","sandals"];
      shoeTypes.forEach(t => {
        expect(TYPE_FILTER.shoes(g(t))).toBe(true);
      });
    });
  });

  describe("layers filter", () => {
    it("includes jacket, coat, blazer, bomber, vest", () => {
      const layerTypes = ["jacket","coat","blazer","bomber","vest"];
      layerTypes.forEach(t => {
        expect(TYPE_FILTER.layers(g(t))).toBe(true);
      });
    });
  });

  describe("extras filter", () => {
    it("includes belt, sunglasses, hat, scarf, bag, accessory", () => {
      const extraTypes = ["belt","sunglasses","hat","scarf","bag","accessory"];
      extraTypes.forEach(t => {
        expect(TYPE_FILTER.extras(g(t))).toBe(true);
      });
    });
  });

  describe("review filter", () => {
    it("includes items with needsReview=true", () => {
      expect(TYPE_FILTER.review({ needsReview: true })).toBe(true);
    });

    it("excludes items with needsReview=false", () => {
      expect(TYPE_FILTER.review({ needsReview: false })).toBeFalsy();
    });
  });

  describe("all filter", () => {
    it("includes everything", () => {
      expect(TYPE_FILTER.all(g("shirt"))).toBe(true);
      expect(TYPE_FILTER.all(g("belt"))).toBe(true);
      expect(TYPE_FILTER.all(g("unknown"))).toBe(true);
      expect(TYPE_FILTER.all({ needsReview: true })).toBe(true);
    });
  });
});

describe("WardrobeGrid — search filtering", () => {
  it("filters by name, type, color, and brand", () => {
    const items = [
      { name: "Navy Oxford Shirt", type: "shirt", color: "navy", brand: "Gant" },
      { name: "Black Chinos", type: "chinos", color: "black", brand: "Zara" },
      { name: "Brown Loafers", type: "loafers", color: "brown", brand: "Massimo" },
    ];

    // By name
    expect(searchFilter(items, "oxford")).toHaveLength(1);
    expect(searchFilter(items, "oxford")[0].name).toBe("Navy Oxford Shirt");

    // By type
    expect(searchFilter(items, "chinos")).toHaveLength(1);
    expect(searchFilter(items, "chinos")[0].name).toBe("Black Chinos");

    // By color
    expect(searchFilter(items, "brown")).toHaveLength(1);
    expect(searchFilter(items, "brown")[0].name).toBe("Brown Loafers");

    // By brand
    expect(searchFilter(items, "gant")).toHaveLength(1);
    expect(searchFilter(items, "gant")[0].name).toBe("Navy Oxford Shirt");

    // Empty query returns all
    expect(searchFilter(items, "")).toHaveLength(3);
  });
});
