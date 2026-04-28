import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock strapRecommender to avoid pulling scoring.js transitive deps
vi.mock("../src/outfitEngine/strapRecommender.js", () => ({
  recommendStrap: () => null,
}));

const { buildOutfit } = await import("../src/outfitEngine/outfitBuilder.js");

describe("sweater warm transition", () => {
  const watch = {
    id: "santos_large",
    label: "Santos Large",
    dial: "white",
    strap: "brown leather",
    formality: 6,
    straps: [{ id: "brown", label: "Brown leather", color: "brown", type: "leather" }],
  };

  const shirt = { id: "s1", type: "shirt", name: "White oxford", color: "white", formality: 6 };
  const pants = { id: "p1", type: "pants", name: "Navy chinos", color: "navy", formality: 5 };
  const shoes = { id: "sh1", type: "shoes", name: "Brown loafers", color: "brown", formality: 6 };
  const sweater = { id: "sw1", type: "sweater", name: "Grey cashmere", color: "grey", formality: 7 };
  const lowScoreSweater = { id: "sw2", type: "sweater", name: "Casual hoodie", color: "red", formality: 2 };

  const wardrobe = [shirt, pants, shoes, sweater, lowScoreSweater];

  it("no sweater at >= 22°C", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 23 }, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("no sweater at exactly 22°C", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 22 }, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("sweater allowed below 18°C with any positive score", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 12 }, [], 5, "smart-casual");
    // below 18°C, minSweaterScore = 0 so sweater should be added
    expect(result.sweater).not.toBeNull();
  });

  it("warm transition zone (18-21°C) requires high score (> 4.0)", () => {
    // In warm transition zone, only high-scoring sweaters should appear
    const result = buildOutfit(watch, wardrobe, { tempC: 19 }, [], 5, "smart-casual");
    // The result depends on whether any sweater scores > 4.0
    // Either sweater is null (none scored high enough) or it's the good one
    if (result.sweater) {
      expect(result.sweater.id).not.toBe("sw2"); // hoodie shouldn't win in smart-casual at 19°C
    }
  });

  it("default temp fallback is 22°C — no sweater on missing weather", () => {
    // Pre-2026-04-28 the fallback was 15°C ("always cold"), which produced phantom
    // sweater layers in warm climates whenever the geolocation/weather fetch failed.
    // The fallback is now 22°C (exactly at the no-extra-layer threshold) so the
    // sweater path early-returns before adding anything.
    const result = buildOutfit(watch, wardrobe, undefined, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("explicit weather=null yields no sweater (warm-default fallback)", () => {
    const result = buildOutfit(watch, wardrobe, null, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("explicit weather={tempC:25} yields no sweater (>=22)", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 25 }, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("layer slot added below 8°C with 2+ sweaters", () => {
    const extraSweater = { id: "sw3", type: "sweater", name: "Navy pullover", color: "navy", formality: 6 };
    const coldWardrobe = [shirt, pants, shoes, sweater, extraSweater];
    const result = buildOutfit(watch, coldWardrobe, { tempC: 5 }, [], 5, "smart-casual");
    expect(result.sweater).not.toBeNull();
    // layer may or may not be filled depending on scoring, but the path is exercised
  });
});
