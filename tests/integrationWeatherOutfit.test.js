import { describe, it, expect, vi, beforeEach } from "vitest";
import { weatherLayerSuggestion } from "../src/features/weather/weatherRules.js";

// Mock stores that buildOutfit imports
vi.mock("../src/stores/rejectStore.js", () => ({
  useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
}));
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: { getState: () => ({ getActiveStrap: () => null }) },
}));

import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";

const watch = {
  id: "w1", brand: "JLC", model: "Reverso", dial: "silver-white",
  style: "dress", formality: 9, genuine: true, bracelet: false,
  strap: "brown leather", straps: [{ type: "leather", color: "brown" }],
};

const garments = [
  { id: "g1", type: "shirt", color: "white", formality: 7, name: "White shirt" },
  { id: "g2", type: "pants", color: "grey", formality: 7, name: "Grey pants" },
  { id: "g3", type: "shoes", color: "brown", formality: 7, name: "Brown shoes" },
  { id: "g4", type: "sweater", color: "navy", formality: 6, name: "Navy sweater" },
  { id: "g5", type: "jacket", color: "charcoal", formality: 8, name: "Charcoal jacket" },
];

describe("Integration: weather → outfit engine → sweater layer", () => {
  it("cold weather (tempC < 22) adds sweater layer via buildOutfit", () => {
    const outfit = buildOutfit(watch, garments, { tempC: 12 }, [], [], {});
    expect(outfit.sweater).not.toBeNull();
    expect(outfit.sweater.type).toBe("sweater");
  });

  it("warm weather (tempC >= 22) omits sweater layer", () => {
    const outfit = buildOutfit(watch, garments, { tempC: 28 }, [], [], {});
    expect(outfit.sweater).toBeNull();
  });
});

describe("Integration: weatherLayerSuggestion thresholds", () => {
  it("temp < 10 → heavy-jacket", () => {
    expect(weatherLayerSuggestion({ temperature: 5 })).toBe("heavy-jacket");
    expect(weatherLayerSuggestion({ temperature: 9 })).toBe("heavy-jacket");
  });

  it("temp < 16 → jacket", () => {
    expect(weatherLayerSuggestion({ temperature: 10 })).toBe("jacket");
    expect(weatherLayerSuggestion({ temperature: 15 })).toBe("jacket");
  });

  it("temp 16-20 → light-sweater", () => {
    expect(weatherLayerSuggestion({ temperature: 16 })).toBe("light-sweater");
    expect(weatherLayerSuggestion({ temperature: 20 })).toBe("light-sweater");
  });

  it("temp >= 26 → no-layer", () => {
    expect(weatherLayerSuggestion({ temperature: 26 })).toBe("no-layer");
    expect(weatherLayerSuggestion({ temperature: 35 })).toBe("no-layer");
  });
});
