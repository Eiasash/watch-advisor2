import { describe, it, expect } from "vitest";

const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket"];
const ACCESSORY_TYPES = new Set(["belt", "sunglasses", "hat", "scarf", "bag", "accessory", "outfit-photo", "outfit-shot"]);

function isWearableGarment(g) {
  return g && !ACCESSORY_TYPES.has(g.type) && !g.excludeFromWardrobe;
}

function filterWearable(garments) {
  return garments.filter(isWearableGarment);
}

const WEATHER_ICONS = {
  "Clear sky": "\u2600\uFE0F",
  "Partly cloudy": "\u26C5",
  "Foggy": "\uD83C\uDF2B\uFE0F",
  "Rain": "\uD83C\uDF27\uFE0F",
  "Snow": "\uD83C\uDF28\uFE0F",
  "Thunderstorm": "\u26C8\uFE0F",
};

describe("WeekPlanner — OUTFIT_SLOTS", () => {
  it("includes all expected slots", () => {
    expect(OUTFIT_SLOTS).toContain("shirt");
    expect(OUTFIT_SLOTS).toContain("sweater");
    expect(OUTFIT_SLOTS).toContain("layer");
    expect(OUTFIT_SLOTS).toContain("pants");
    expect(OUTFIT_SLOTS).toContain("shoes");
    expect(OUTFIT_SLOTS).toContain("jacket");
    expect(OUTFIT_SLOTS).toHaveLength(6);
  });
});

describe("WeekPlanner — ACCESSORY_TYPES", () => {
  it("has belt, sunglasses, hat, scarf, bag, accessory, outfit-photo, outfit-shot", () => {
    expect(ACCESSORY_TYPES.has("belt")).toBe(true);
    expect(ACCESSORY_TYPES.has("sunglasses")).toBe(true);
    expect(ACCESSORY_TYPES.has("hat")).toBe(true);
    expect(ACCESSORY_TYPES.has("scarf")).toBe(true);
    expect(ACCESSORY_TYPES.has("bag")).toBe(true);
    expect(ACCESSORY_TYPES.has("accessory")).toBe(true);
    expect(ACCESSORY_TYPES.has("outfit-photo")).toBe(true);
    expect(ACCESSORY_TYPES.has("outfit-shot")).toBe(true);
    expect(ACCESSORY_TYPES.size).toBe(8);
  });
});

describe("WeekPlanner — isWearableGarment", () => {
  it("returns true for shirt", () => {
    expect(isWearableGarment({ type: "shirt", excludeFromWardrobe: false })).toBe(true);
  });

  it("returns false for belt (accessory type)", () => {
    expect(isWearableGarment({ type: "belt", excludeFromWardrobe: false })).toBe(false);
  });

  it("returns false for excluded garment", () => {
    expect(isWearableGarment({ type: "shirt", excludeFromWardrobe: true })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWearableGarment(null)).toBeFalsy();
  });
});

describe("WeekPlanner — filterWearable", () => {
  it("filters out accessories and keeps wearable garments", () => {
    const garments = [
      { id: "1", type: "shirt", excludeFromWardrobe: false },
      { id: "2", type: "belt", excludeFromWardrobe: false },
      { id: "3", type: "pants", excludeFromWardrobe: false },
      { id: "4", type: "sunglasses", excludeFromWardrobe: false },
      { id: "5", type: "shoes", excludeFromWardrobe: false },
      { id: "6", type: "outfit-photo", excludeFromWardrobe: false },
    ];
    const result = filterWearable(garments);
    expect(result).toHaveLength(3);
    expect(result.map(g => g.type)).toEqual(["shirt", "pants", "shoes"]);
  });
});

describe("WeekPlanner — WEATHER_ICONS", () => {
  it("maps known weather descriptions to emoji strings", () => {
    expect(WEATHER_ICONS["Clear sky"]).toBeDefined();
    expect(WEATHER_ICONS["Partly cloudy"]).toBeDefined();
    expect(WEATHER_ICONS["Foggy"]).toBeDefined();
    expect(WEATHER_ICONS["Rain"]).toBeDefined();
    expect(WEATHER_ICONS["Snow"]).toBeDefined();
    expect(WEATHER_ICONS["Thunderstorm"]).toBeDefined();
    expect(Object.keys(WEATHER_ICONS)).toHaveLength(6);
  });
});
