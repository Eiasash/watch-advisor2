import { describe, it, expect } from "vitest";

// ── Replicated pure filter logic from WardrobeGrid.jsx ───────────────────────

const TYPE_FILTER = {
  all:     () => true,
  tops:    g => g.type === "shirt",
  bottoms: g => g.type === "pants",
  shoes:   g => g.type === "shoes",
  layers:  g => g.type === "jacket" || g.type === "sweater",
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
  describe("tops filter — canonical types only", () => {
    it("includes shirt", () => {
      expect(TYPE_FILTER.tops(g("shirt"))).toBe(true);
    });

    it("excludes sweater (now in layers)", () => {
      expect(TYPE_FILTER.tops(g("sweater"))).toBe(false);
    });

    it("excludes pants", () => {
      expect(TYPE_FILTER.tops(g("pants"))).toBe(false);
    });

    it("excludes non-canonical polo/tee (normalized to shirt before reaching filter)", () => {
      expect(TYPE_FILTER.tops(g("polo"))).toBe(false);
      expect(TYPE_FILTER.tops(g("tee"))).toBe(false);
    });
  });

  describe("bottoms filter — canonical types only", () => {
    it("includes pants (canonical type)", () => {
      expect(TYPE_FILTER.bottoms(g("pants"))).toBe(true);
    });

    it("excludes non-canonical jeans/chinos (normalized to pants before reaching filter)", () => {
      expect(TYPE_FILTER.bottoms(g("jeans"))).toBe(false);
      expect(TYPE_FILTER.bottoms(g("chinos"))).toBe(false);
    });

    it("excludes shirt", () => {
      expect(TYPE_FILTER.bottoms(g("shirt"))).toBe(false);
    });
  });

  describe("shoes filter — canonical type only", () => {
    it("includes shoes", () => {
      expect(TYPE_FILTER.shoes(g("shoes"))).toBe(true);
    });

    it("excludes non-canonical boots/sneakers (normalized to shoes)", () => {
      expect(TYPE_FILTER.shoes(g("boots"))).toBe(false);
      expect(TYPE_FILTER.shoes(g("sneakers"))).toBe(false);
    });
  });

  describe("layers filter — jacket and sweater", () => {
    it("includes jacket", () => {
      expect(TYPE_FILTER.layers(g("jacket"))).toBe(true);
    });

    it("includes sweater", () => {
      expect(TYPE_FILTER.layers(g("sweater"))).toBe(true);
    });

    it("excludes non-canonical coat/blazer (normalized to jacket)", () => {
      expect(TYPE_FILTER.layers(g("coat"))).toBe(false);
      expect(TYPE_FILTER.layers(g("blazer"))).toBe(false);
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
