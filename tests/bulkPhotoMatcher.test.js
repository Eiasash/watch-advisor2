import { describe, it, expect } from "vitest";

// ── Test BulkPhotoMatcher pure logic ────────────────────────────────────────

const CATEGORY_ORDER = ["jacket", "sweater", "shirt", "pants", "shoes", "belt"];
const CATEGORY_LABELS = {
  jacket: "Outerwear", sweater: "Knitwear", shirt: "Shirts",
  pants: "Bottoms", shoes: "Footwear", belt: "Belts",
};

describe("BulkPhotoMatcher — category ordering", () => {
  it("has 6 categories in correct order", () => {
    expect(CATEGORY_ORDER).toEqual(["jacket", "sweater", "shirt", "pants", "shoes", "belt"]);
  });

  it("all categories have labels", () => {
    for (const cat of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

describe("BulkPhotoMatcher — grouping logic", () => {
  const garments = [
    { id: "1", name: "Navy Blazer", type: "jacket", color: "navy" },
    { id: "2", name: "White Oxford", type: "shirt", color: "white" },
    { id: "3", name: "Grey Chinos", type: "pants", color: "grey" },
    { id: "4", name: "Outfit Pic", type: "outfit-photo" },
    { id: "5", name: "Brown Loafers", type: "shoes", color: "brown" },
    { id: "6", name: "Cashmere Sweater", type: "sweater", color: "charcoal" },
    { id: "7", name: "Leather Belt", type: "belt", color: "brown" },
    { id: "8", name: "Suede Boots", type: "shoes", color: "tan" },
    { id: "9", name: "Sunglasses", type: "sunglasses", color: "black" },
  ];

  function groupGarments(list) {
    const grouped = {};
    for (const g of list) {
      const cat = g.type ?? g.category ?? "other";
      if (cat === "outfit-photo") continue;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(g);
    }
    return grouped;
  }

  it("groups garments by type", () => {
    const grouped = groupGarments(garments);
    expect(grouped.jacket).toHaveLength(1);
    expect(grouped.shirt).toHaveLength(1);
    expect(grouped.shoes).toHaveLength(2);
  });

  it("excludes outfit-photo type", () => {
    const grouped = groupGarments(garments);
    expect(grouped["outfit-photo"]).toBeUndefined();
  });

  it("groups non-standard types under their own key", () => {
    const grouped = groupGarments(garments);
    expect(grouped.sunglasses).toHaveLength(1);
  });

  it("handles garments with category field instead of type", () => {
    const items = [
      { id: "x", name: "Scarf", category: "scarf" },
    ];
    const grouped = groupGarments(items);
    expect(grouped.scarf).toHaveLength(1);
  });

  it("defaults to 'other' when both type and category are missing", () => {
    const items = [{ id: "y", name: "Unknown" }];
    const grouped = groupGarments(items);
    expect(grouped.other).toHaveLength(1);
  });
});

describe("BulkPhotoMatcher — photo stats", () => {
  it("counts garments with photos", () => {
    const garments = [
      { id: "1", type: "shirt", thumbnail: "data:..." },
      { id: "2", type: "pants", photoUrl: "https://..." },
      { id: "3", type: "shoes" },
      { id: "4", type: "outfit-photo", thumbnail: "data:..." },
    ];

    const totalWithPhoto = garments.filter(g => g.thumbnail || g.photoUrl).length;
    const totalWearable = garments.filter(g => (g.type ?? g.category) !== "outfit-photo").length;

    expect(totalWithPhoto).toBe(3); // shirt + pants + outfit-photo
    expect(totalWearable).toBe(3); // shirt + pants + shoes
  });

  it("handles empty garment list", () => {
    const totalWithPhoto = [].filter(g => g.thumbnail || g.photoUrl).length;
    const totalWearable = [].filter(g => (g.type ?? g.category) !== "outfit-photo").length;
    expect(totalWithPhoto).toBe(0);
    expect(totalWearable).toBe(0);
  });
});

describe("BulkPhotoMatcher — photo status logic", () => {
  it("detects garments with thumbnail", () => {
    const g = { thumbnail: "data:image/jpeg;base64,abc" };
    expect(!!(g.thumbnail || g.photoUrl)).toBe(true);
  });

  it("detects garments with photoUrl", () => {
    const g = { photoUrl: "https://storage.example.com/photo.jpg" };
    expect(!!(g.thumbnail || g.photoUrl)).toBe(true);
  });

  it("detects garments without any photo", () => {
    const g = { id: "1", name: "Shirt" };
    expect(!!(g.thumbnail || g.photoUrl)).toBe(false);
  });

  it("empty string thumbnail counts as no photo", () => {
    const g = { thumbnail: "" };
    expect(!!(g.thumbnail || g.photoUrl)).toBe(false);
  });
});

describe("BulkPhotoMatcher — sort within categories", () => {
  it("sorts items alphabetically by name", () => {
    const items = [
      { id: "1", name: "Zebra Shirt" },
      { id: "2", name: "Alpha Shirt" },
      { id: "3", name: "Omega Shirt" },
    ];
    const sorted = [...items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    expect(sorted[0].name).toBe("Alpha Shirt");
    expect(sorted[1].name).toBe("Omega Shirt");
    expect(sorted[2].name).toBe("Zebra Shirt");
  });

  it("handles null names gracefully", () => {
    const items = [
      { id: "1", name: "Shirt" },
      { id: "2" },
    ];
    const sorted = [...items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    expect(sorted[0].name).toBeUndefined(); // empty string sorts before "Shirt"
  });
});
