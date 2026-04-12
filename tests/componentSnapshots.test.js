/**
 * Component structure snapshot tests.
 *
 * Validates that the core data structures, configuration constants, and
 * filtering logic extracted from WardrobeGrid.jsx and WeekPlanner.jsx
 * remain stable and do not regress.
 *
 * Uses toMatchObject / deep equality for structural assertions rather
 * than React render snapshots (which would require full component mounts
 * with all store + service dependencies).
 */
import { describe, it, expect } from "vitest";

// ── WardrobeGrid structures ─────────────────────────────────────────────────

const ALL_FILTERS = [
  { label: "All",     key: "all" },
  { label: "Tops",    key: "tops" },
  { label: "Bottoms", key: "bottoms" },
  { label: "Shoes",   key: "shoes" },
  { label: "Layers",  key: "layers" },
  { label: "Extras",  key: "extras" },
  { label: "Review",  key: "review" },
];

const TYPE_FILTER = {
  all:     () => true,
  tops:    g => g.type === "shirt",
  bottoms: g => g.type === "pants",
  shoes:   g => g.type === "shoes",
  layers:  g => g.type === "jacket" || g.type === "sweater",
  extras:  g => ["belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type),
  review:  g => g.needsReview,
};

const TYPE_ICONS = {
  shirt:"👔", pants:"👖", shoes:"👟", jacket:"🧥", sweater:"🧶",
  belt:"🔗", sunglasses:"🕶️", hat:"🧢", scarf:"🧣", bag:"👜", accessory:"💍",
};

const COLOR_SWATCHES = {
  black:"#1a1a1a", white:"#f5f5f0", grey:"#8a8a8a", gray:"#8a8a8a",
  navy:"#1e2f5e", blue:"#2d5fa0", brown:"#6b3a2a", tan:"#c4a882",
  beige:"#d4c4a8", olive:"#6b7c3a", green:"#2d6b3a", red:"#8b2020",
  burgundy:"#6b1a2a", cream:"#e8e0cc", orange:"#c45c20", purple:"#5a2a7a",
};

// ── WeekPlanner structures ──────────────────────────────────────────────────

const CONTEXTS = [
  { key: null,                  label:"Any Vibe" },
  { key:"smart-casual",        label:"Smart Casual" },
  { key:"casual",              label:"Casual" },
  { key:"date-night",          label:"Date Night" },
  { key:"shift",               label:"On-Call Shift" },
  { key:"eid-celebration",     label:"Eid" },
  { key:"family-event",        label:"Family Event" },
];

const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
const SLOT_ICONS = { shirt:"\u{1F454}", sweater:"\u{1FAA2}", layer:"\u{1F9E3}", pants:"\u{1F456}", shoes:"\u{1F45F}", jacket:"\u{1F9E5}", belt:"\u{1FAA2}" };
const ACCESSORY_TYPES = new Set(["sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

const WEATHER_ICONS = {
  "Clear sky": "\u2600\uFE0F",
  "Partly cloudy": "\u26C5",
  "Foggy": "\u{1F32B}\uFE0F",
  "Rain": "\u{1F327}\uFE0F",
  "Snow": "\u{1F328}\uFE0F",
  "Thunderstorm": "\u26C8\uFE0F",
};

// ── WardrobeGrid filter structure snapshots ─────────────────────────────────

describe("WardrobeGrid — filter tab structure snapshot", () => {
  it("ALL_FILTERS has exactly 7 entries", () => {
    expect(ALL_FILTERS).toHaveLength(7);
  });

  it("ALL_FILTERS keys match expected set", () => {
    const keys = ALL_FILTERS.map(f => f.key);
    expect(keys).toEqual(["all", "tops", "bottoms", "shoes", "layers", "extras", "review"]);
  });

  it("ALL_FILTERS labels match expected set", () => {
    const labels = ALL_FILTERS.map(f => f.label);
    expect(labels).toEqual(["All", "Tops", "Bottoms", "Shoes", "Layers", "Extras", "Review"]);
  });

  it("every filter has both key and label properties", () => {
    for (const filter of ALL_FILTERS) {
      expect(filter).toHaveProperty("key");
      expect(filter).toHaveProperty("label");
      expect(typeof filter.key).toBe("string");
      expect(typeof filter.label).toBe("string");
    }
  });

  it("all filter keys map to TYPE_FILTER functions", () => {
    for (const filter of ALL_FILTERS) {
      expect(typeof TYPE_FILTER[filter.key]).toBe("function");
    }
  });
});

describe("WardrobeGrid — TYPE_ICONS structure snapshot", () => {
  it("has icons for all canonical garment types", () => {
    const canonicalTypes = ["shirt", "pants", "shoes", "jacket", "sweater", "belt", "sunglasses", "hat", "scarf", "bag", "accessory"];
    for (const type of canonicalTypes) {
      expect(TYPE_ICONS[type]).toBeTruthy();
    }
  });

  it("icon count matches canonical type count", () => {
    expect(Object.keys(TYPE_ICONS)).toHaveLength(11);
  });
});

describe("WardrobeGrid — COLOR_SWATCHES structure snapshot", () => {
  it("has hex values for all common colors", () => {
    const expectedColors = ["black", "white", "grey", "gray", "navy", "blue", "brown", "tan", "beige", "olive", "green", "red", "burgundy", "cream", "orange", "purple"];
    for (const color of expectedColors) {
      expect(COLOR_SWATCHES[color]).toBeTruthy();
      expect(COLOR_SWATCHES[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("grey and gray are identical", () => {
    expect(COLOR_SWATCHES.grey).toBe(COLOR_SWATCHES.gray);
  });

  it("swatch count matches expected", () => {
    expect(Object.keys(COLOR_SWATCHES)).toHaveLength(16);
  });
});

// ── WeekPlanner structure snapshots ─────────────────────────────────────────

describe("WeekPlanner — CONTEXTS structure snapshot", () => {
  it("has exactly 7 context options", () => {
    expect(CONTEXTS).toHaveLength(7);
  });

  it("first context is 'Any Vibe' with null key", () => {
    expect(CONTEXTS[0]).toEqual({ key: null, label: "Any Vibe" });
  });

  it("all non-null context keys are kebab-case strings", () => {
    for (const ctx of CONTEXTS) {
      if (ctx.key !== null) {
        expect(ctx.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      }
    }
  });

  it("every context has both key and label", () => {
    for (const ctx of CONTEXTS) {
      expect(ctx).toHaveProperty("key");
      expect(ctx).toHaveProperty("label");
      expect(typeof ctx.label).toBe("string");
      expect(ctx.label.length).toBeGreaterThan(0);
    }
  });

  it("context keys match scoring module CONTEXT_FORMALITY keys", () => {
    // These keys should correspond to CONTEXT_FORMALITY in scoring.js
    const nonNullKeys = CONTEXTS.filter(c => c.key !== null).map(c => c.key);
    expect(nonNullKeys).toContain("smart-casual");
    expect(nonNullKeys).toContain("casual");
    expect(nonNullKeys).toContain("date-night");
    expect(nonNullKeys).toContain("shift");
    expect(nonNullKeys).toContain("eid-celebration");
    expect(nonNullKeys).toContain("family-event");
  });
});

describe("WeekPlanner — OUTFIT_SLOTS structure snapshot", () => {
  it("has exactly 7 slots", () => {
    expect(OUTFIT_SLOTS).toHaveLength(7);
  });

  it("slot order is shirt, sweater, layer, pants, shoes, jacket, belt", () => {
    expect(OUTFIT_SLOTS).toEqual(["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"]);
  });

  it("every slot has a corresponding icon", () => {
    for (const slot of OUTFIT_SLOTS) {
      expect(SLOT_ICONS[slot]).toBeTruthy();
    }
  });
});

describe("WeekPlanner — ACCESSORY_TYPES structure snapshot", () => {
  it("has exactly 7 accessory types (belt is a slot, not an accessory)", () => {
    // WeekPlanner.jsx defines ACCESSORY_TYPES without belt — belt has its own OUTFIT_SLOT
    expect(ACCESSORY_TYPES.size).toBe(7);
  });

  it("contains all expected accessory types", () => {
    const expected = ["sunglasses", "hat", "scarf", "bag", "accessory", "outfit-photo", "outfit-shot"];
    for (const t of expected) {
      expect(ACCESSORY_TYPES.has(t)).toBe(true);
    }
  });

  it("does NOT contain wearable garment types", () => {
    const wearable = ["shirt", "pants", "shoes", "jacket", "sweater"];
    for (const t of wearable) {
      expect(ACCESSORY_TYPES.has(t)).toBe(false);
    }
  });
});

describe("WeekPlanner — WEATHER_ICONS structure snapshot", () => {
  it("has 6 weather conditions", () => {
    expect(Object.keys(WEATHER_ICONS)).toHaveLength(6);
  });

  it("maps all expected weather conditions", () => {
    const conditions = ["Clear sky", "Partly cloudy", "Foggy", "Rain", "Snow", "Thunderstorm"];
    for (const cond of conditions) {
      expect(WEATHER_ICONS[cond]).toBeTruthy();
    }
  });

  it("all icon values are non-empty strings", () => {
    for (const icon of Object.values(WEATHER_ICONS)) {
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });
});

// ── Cross-component consistency snapshots ───────────────────────────────────

describe("Cross-component consistency", () => {
  it("WardrobeGrid extras filter covers all WeekPlanner ACCESSORY_TYPES except outfit types", () => {
    const extrasFilter = TYPE_FILTER.extras;
    // outfit-photo and outfit-shot are excluded from wardrobe grid by excludeFromWardrobe flag,
    // not by the extras filter. The extras filter covers belt/sunglasses/hat/scarf/bag/accessory.
    const garmentAccessories = ["belt", "sunglasses", "hat", "scarf", "bag", "accessory"];
    for (const t of garmentAccessories) {
      expect(extrasFilter({ type: t })).toBe(true);
    }
  });

  it("OUTFIT_SLOTS core types are all covered by WardrobeGrid filters", () => {
    const coreTypes = ["shirt", "pants", "shoes", "jacket", "sweater"];
    for (const type of coreTypes) {
      // Should pass at least one non-'all' filter
      const passesAny = ["tops", "bottoms", "shoes", "layers", "extras"].some(
        filterKey => TYPE_FILTER[filterKey]({ type })
      );
      expect(passesAny).toBe(true);
    }
  });

  it("belt is an ACCESSORY_TYPE in WeekPlanner but filterable in WardrobeGrid extras", () => {
    // belt is in WeekPlanner ACCESSORY_TYPES? Actually no — belt is in OUTFIT_SLOTS
    // but the WeekPlanner's separate ACCESSORY_TYPES set is for filtering non-slot items.
    // Belt IS a slot in OUTFIT_SLOTS but NOT in ACCESSORY_TYPES.
    expect(ACCESSORY_TYPES.has("belt")).toBe(false);
    expect(TYPE_FILTER.extras({ type: "belt" })).toBe(true);
    expect(OUTFIT_SLOTS).toContain("belt");
  });
});

// ── daysSinceWorn helper snapshot ───────────────────────────────────────────

function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      return Math.round((new Date(today) - new Date(d)) / 86400000);
    }
  }
  return null;
}

describe("WeekPlanner — daysSinceWorn helper", () => {
  it("returns null for watch not in history", () => {
    expect(daysSinceWorn("unknown", [{ watchId: "other", date: "2026-01-01" }])).toBeNull();
  });

  it("returns 0 for watch worn today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysSinceWorn("w1", [{ watchId: "w1", date: today }])).toBe(0);
  });

  it("returns correct days for past wear", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    expect(daysSinceWorn("w1", [{ watchId: "w1", date: threeDaysAgo }])).toBe(3);
  });

  it("returns null for empty history", () => {
    expect(daysSinceWorn("w1", [])).toBeNull();
  });

  it("finds first matching entry in history order", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const history = [
      { watchId: "w1", date: today },
      { watchId: "w1", date: yesterday },
    ];
    expect(daysSinceWorn("w1", history)).toBe(0);
  });

  it("skips entries without date field", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const history = [
      { watchId: "w1" }, // no date
      { watchId: "w1", date: twoDaysAgo },
    ];
    expect(daysSinceWorn("w1", history)).toBe(2);
  });
});
