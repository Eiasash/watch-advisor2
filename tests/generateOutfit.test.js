import { describe, it, expect } from "vitest";
import { generateOutfit } from "./helpers/legacyShim.js";

const shirt   = { id: "s1", type: "shirt", color: "white" };
const pants   = { id: "p1", type: "pants", color: "navy" };
const shoes   = { id: "sh1", type: "shoes", color: "brown" };
const jacket  = { id: "j1", type: "jacket", color: "grey" };
const sweater = { id: "sw1", type: "sweater", color: "navy" };
const belt    = { id: "b1", type: "belt", color: "brown" };
const outfitPhoto = { id: "op1", type: "outfit-photo", color: "none" };

const watch = { id: "snowflake", brand: "Grand Seiko", style: "sport-elegant" };
const garments = [shirt, pants, shoes, jacket, sweater, belt, outfitPhoto];

describe("generateOutfit", () => {
  it("returns all five slots", () => {
    const result = generateOutfit(watch, garments, { tempC: 5 });
    expect(result).toHaveProperty("shirt");
    expect(result).toHaveProperty("pants");
    expect(result).toHaveProperty("shoes");
    expect(result).toHaveProperty("jacket");
    expect(result).toHaveProperty("sweater");
  });

  it("fills shirt, pants, shoes from wardrobe", () => {
    const result = generateOutfit(watch, garments, null);
    expect(result.shirt.id).toBe("s1");
    expect(result.pants.id).toBe("p1");
    expect(result.shoes.id).toBe("sh1");
  });

  it("excludes accessories from outfit slots", () => {
    const result = generateOutfit(watch, [belt, shirt, pants, shoes], null);
    expect(result.shirt.id).toBe("s1");
  });

  it("excludes outfit-photo from outfit slots", () => {
    const result = generateOutfit(watch, [outfitPhoto, shirt, pants, shoes], null);
    expect(result.shirt.id).toBe("s1");
  });

  it("excludes garments with excludeFromWardrobe flag", () => {
    const excluded = { ...shirt, excludeFromWardrobe: true };
    const result = generateOutfit(watch, [excluded, pants, shoes], null);
    expect(result.shirt).toBe(null);
  });

  // ─── Weather-based jacket/sweater logic (uses tempC) ───────────────────
  it("temp < 22 → jacket and sweater", () => {
    const result = generateOutfit(watch, garments, { tempC: 5 });
    expect(result.jacket).not.toBeNull();
    expect(result.jacket.type).toBe("jacket");
    expect(result.sweater).not.toBeNull();
    expect(result.sweater.type).toBe("sweater");
  });

  it("temp < 22 → sweater layer populated", () => {
    const result = generateOutfit(watch, garments, { tempC: 12 });
    expect(result.sweater).not.toBeNull();
  });

  it("temp >= 22 → jacket still filled (always a base slot), no sweater", () => {
    const result = generateOutfit(watch, garments, { tempC: 25 });
    expect(result.jacket).not.toBeNull();
    expect(result.sweater).toBeNull();
  });

  it("null weather → jacket still filled, no sweater (tempC defaults to 22)", () => {
    const result = generateOutfit(watch, garments, null);
    expect(result.jacket).not.toBeNull();
    expect(result.sweater).toBeNull();
  });

  it("undefined weather → jacket still filled, no sweater", () => {
    const result = generateOutfit(watch, garments, undefined);
    expect(result.jacket).not.toBeNull();
    expect(result.sweater).toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────
  it("returns null slots when no garments of that type exist", () => {
    const result = generateOutfit(watch, [], null);
    expect(result.shirt).toBeNull();
    expect(result.pants).toBeNull();
    expect(result.shoes).toBeNull();
    expect(result.jacket).toBeNull();
    expect(result.sweater).toBeNull();
  });

  it("jacket only when no sweaters available (cold)", () => {
    const noSweater = [shirt, pants, shoes, jacket];
    const result = generateOutfit(watch, noSweater, { tempC: 10 });
    expect(result.jacket.type).toBe("jacket");
    expect(result.sweater).toBeNull();
  });

  it("shirts only in shirt slot (sweaters excluded)", () => {
    const result = generateOutfit(watch, garments, null);
    if (result.shirt) expect(result.shirt.type).toBe("shirt");
  });

  // ─── Regression: garments with category instead of type ──────────────────
  it("handles garments with category field instead of type", () => {
    const cloudGarments = [
      { id: "c1", category: "shirt", color: "blue" },
      { id: "c2", category: "pants", color: "grey" },
      { id: "c3", category: "shoes", color: "black" },
    ];
    const result = generateOutfit(watch, cloudGarments, null);
    expect(result.shirt.id).toBe("c1");
    expect(result.pants.id).toBe("c2");
    expect(result.shoes.id).toBe("c3");
  });

  it("handles mixed type and category fields", () => {
    const mixed = [
      { id: "m1", type: "shirt", color: "white" },
      { id: "m2", category: "pants", color: "navy" },
      { id: "m3", type: "shoes", color: "brown" },
    ];
    const result = generateOutfit(watch, mixed, null);
    expect(result.shirt.id).toBe("m1");
    expect(result.pants.id).toBe("m2");
    expect(result.shoes.id).toBe("m3");
  });
});
