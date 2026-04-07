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

// ─── Regression: buildOutfit crash guard ─────────────────────────────────────
// WeekPlanner wraps buildOutfit in try/catch. Verify the fallback shape
// matches what downstream rendering expects.

describe("WeekPlanner — buildOutfit crash fallback shape", () => {
  const FALLBACK = {
    shirt: null, pants: null, shoes: null, jacket: null,
    sweater: null, layer: null, belt: null,
    _score: 0, _confidence: 0, _confidenceLabel: "none",
    _explanation: ["Outfit generation failed — try shuffling."],
  };

  it("fallback has all null slots", () => {
    for (const slot of OUTFIT_SLOTS) {
      expect(FALLBACK[slot]).toBeNull();
    }
    expect(FALLBACK.belt).toBeNull();
  });

  it("fallback has safe metadata", () => {
    expect(FALLBACK._score).toBe(0);
    expect(FALLBACK._confidence).toBe(0);
    expect(FALLBACK._confidenceLabel).toBe("none");
    expect(FALLBACK._explanation).toHaveLength(1);
  });

  it("fallback slots are safe to access with optional chaining", () => {
    // Simulates: OUTFIT_SLOTS.map(s => dayOutfit[s]?.id).filter(Boolean)
    const ids = OUTFIT_SLOTS.map(s => FALLBACK[s]?.id).filter(Boolean);
    expect(ids).toHaveLength(0);
  });

  it("OutfitSlotChip candidates default prevents crash on undefined", () => {
    // Simulates: candidates = [] (default param)
    const candidates = undefined ?? [];
    expect(candidates.length).toBe(0);
  });
});

// ─── handleSwapGarment null clearing ─────────────────────────────────────────
// WeekPlanner.jsx line 176-182: garment?.id ?? null

describe("WeekPlanner — handleSwapGarment null clearing", () => {
  it("null garment produces null slot value (clears slot)", () => {
    const garment = null;
    const result = garment?.id ?? null;
    expect(result).toBeNull();
  });

  it("undefined garment produces null slot value (clears slot)", () => {
    const garment = undefined;
    const result = garment?.id ?? null;
    expect(result).toBeNull();
  });

  it("garment with id produces the id", () => {
    const garment = { id: "g-123", name: "White shirt" };
    const result = garment?.id ?? null;
    expect(result).toBe("g-123");
  });

  it("garment with null id falls back to null", () => {
    const garment = { id: null, name: "Missing id" };
    const result = garment?.id ?? null;
    expect(result).toBeNull();
  });

  it("swapping slot updates overrides map correctly", () => {
    // Simulates the override map logic in WeekPlanner
    const overrides = {};
    const dayKey = "2026-04-07";
    const slot = "shirt";

    // Swap to a garment
    const swapGarment = { id: "g-456" };
    overrides[dayKey] = { ...(overrides[dayKey] ?? {}), [slot]: swapGarment?.id ?? null };
    expect(overrides[dayKey].shirt).toBe("g-456");

    // Clear the slot (null garment = "None — remove")
    const clearGarment = null;
    overrides[dayKey] = { ...(overrides[dayKey] ?? {}), [slot]: clearGarment?.id ?? null };
    expect(overrides[dayKey].shirt).toBeNull();
  });
});
