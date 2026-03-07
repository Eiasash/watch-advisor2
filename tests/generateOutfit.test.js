import { describe, it, expect } from "vitest";
import { generateOutfit } from "../src/features/outfits/generateOutfit.js";

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
  it("returns all four slots", () => {
    const result = generateOutfit(watch, garments, { temperature: 5 });
    expect(result).toHaveProperty("shirt");
    expect(result).toHaveProperty("pants");
    expect(result).toHaveProperty("shoes");
    expect(result).toHaveProperty("jacket");
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
    // sweater can fill shirt slot since shirts include sweaters
    expect(result.shirt).toBe(null);
  });

  // ─── Weather-based jacket logic ──────────────────────────────────────────
  it("temp < 10 → jacket", () => {
    const result = generateOutfit(watch, garments, { temperature: 5 });
    expect(result.jacket).not.toBeNull();
    expect(result.jacket.type).toBe("jacket");
  });

  it("temp 10–15 → jacket", () => {
    const result = generateOutfit(watch, garments, { temperature: 12 });
    expect(result.jacket).not.toBeNull();
  });

  it("temp 16–20 → sweater preferred, jacket fallback", () => {
    const result = generateOutfit(watch, garments, { temperature: 18 });
    expect(result.jacket).not.toBeNull();
    expect(result.jacket.type).toBe("sweater");
  });

  it("temp >= 21 → no jacket", () => {
    const result = generateOutfit(watch, garments, { temperature: 25 });
    expect(result.jacket).toBeNull();
  });

  it("null weather → no jacket", () => {
    const result = generateOutfit(watch, garments, null);
    expect(result.jacket).toBeNull();
  });

  it("undefined weather → no jacket", () => {
    const result = generateOutfit(watch, garments, undefined);
    expect(result.jacket).toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────
  it("returns null slots when no garments of that type exist", () => {
    const result = generateOutfit(watch, [], null);
    expect(result.shirt).toBeNull();
    expect(result.pants).toBeNull();
    expect(result.shoes).toBeNull();
    expect(result.jacket).toBeNull();
  });

  it("falls back to jacket when no sweaters available (temp 16–20)", () => {
    const noSweater = [shirt, pants, shoes, jacket];
    const result = generateOutfit(watch, noSweater, { temperature: 18 });
    expect(result.jacket.type).toBe("jacket");
  });
});
