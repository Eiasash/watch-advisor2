import { describe, it, expect } from "vitest";
import { getLayerRecommendation } from "../src/weather/weatherService.js";
import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

describe("layer logic — coat <10 / sweater 10-12 / none >=13", () => {
  it("getLayerRecommendation honours the 3 bands", () => {
    expect(getLayerRecommendation(8).layer).toBe("coat");
    expect(getLayerRecommendation(10).layer).toBe("sweater");
    expect(getLayerRecommendation(12.9).layer).toBe("sweater");
    expect(getLayerRecommendation(13).layer).toBe("none");
    expect(getLayerRecommendation(18).layer).toBe("none");
  });

  const watch = { id: "w", dial: "white", formality: 5, straps: [{ id: "b", type: "bracelet", label: "Bracelet" }] };
  const wardrobe = [
    { id: "sh", type: "shirt", color: "white", formality: 5 },
    { id: "p", type: "pants", color: "navy", formality: 5 },
    { id: "s", type: "shoes", color: "brown", formality: 5 },
    { id: "sw", type: "sweater", name: "Grey cashmere", color: "grey", formality: 6 },
  ];

  it("adds a sweater at 9C (below warm-transition)", () => {
    expect(buildOutfit(watch, wardrobe, { tempC: 9 }, [], 5, "smart-casual").sweater).not.toBeNull();
  });
  it("no sweater at 13C (>= no-layer threshold)", () => {
    expect(buildOutfit(watch, wardrobe, { tempC: 13 }, [], 5, "smart-casual").sweater).toBeNull();
  });
  it("no sweater at 18C", () => {
    expect(buildOutfit(watch, wardrobe, { tempC: 18 }, [], 5, "smart-casual").sweater).toBeNull();
  });
});
