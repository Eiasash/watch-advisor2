/**
 * Tests for:
 * 1. Shuffle exclusion — garments chosen in earlier rounds stay excluded (no cycling)
 * 2. buildOutfit layer logic — temp < 12°C + 2 sweaters fills outfit.layer
 * 3. buildOutfit null watch — returns layer: null
 * 4. History store — notes + outfitPhotos are persisted on log entry
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
  getImage: vi.fn().mockResolvedValue(undefined),
}));

import { buildOutfit } from "../src/outfitEngine/outfitBuilder.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const laureato = WATCH_COLLECTION.find(w => w.id === "laureato") ?? WATCH_COLLECTION[0];

// ─── Shared wardrobe fixture ────────────────────────────────────────────────
const wardrobe = [
  { id: "sh1", type: "shirt",   name: "White Oxford",     color: "white",  formality: 7 },
  { id: "sh2", type: "shirt",   name: "Navy Polo",        color: "navy",   formality: 6 },
  { id: "sh3", type: "shirt",   name: "Pink Shirt",       color: "pink",   formality: 6 },
  { id: "p1",  type: "pants",   name: "Dark Chinos",      color: "brown",  formality: 5 },
  { id: "p2",  type: "pants",   name: "Grey Trousers",    color: "grey",   formality: 7 },
  { id: "s1",  type: "shoes",   name: "Tan Eccos",        color: "tan",    formality: 6 },
  { id: "s2",  type: "shoes",   name: "Black Eccos",      color: "black",  formality: 7 },
  { id: "j1",  type: "jacket",  name: "Camel Coat",       color: "camel",  formality: 7 },
  { id: "sw1", type: "sweater", name: "Black Cable Knit", color: "black",  formality: 7 },
  { id: "sw2", type: "sweater", name: "Ecru Cable Knit",  color: "ecru",   formality: 6 },
  { id: "sw3", type: "sweater", name: "Navy Cable Knit",  color: "navy",   formality: 6 },
];

// ─── Layer logic ─────────────────────────────────────────────────────────────

describe("buildOutfit — layer slot", () => {
  it("fills layer when temp < 12°C and 2+ sweaters exist", () => {
    const outfit = buildOutfit(laureato, wardrobe, { tempC: 5 });
    expect(outfit.layer).not.toBeNull();
    expect(outfit.layer).toBeTruthy();
  });

  it("layer is a different garment from sweater", () => {
    const outfit = buildOutfit(laureato, wardrobe, { tempC: 5 });
    expect(outfit.sweater?.id).toBeTruthy();
    expect(outfit.layer?.id).toBeTruthy();
    expect(outfit.layer.id).not.toBe(outfit.sweater.id);
  });

  it("layer is null when temp >= 12°C", () => {
    const outfit = buildOutfit(laureato, wardrobe, { tempC: 15 });
    expect(outfit.layer).toBeNull();
  });

  it("layer is null when only 1 sweater available even when very cold", () => {
    const oneSweater = wardrobe.filter(g => g.id !== "sw2" && g.id !== "sw3");
    const outfit = buildOutfit(laureato, oneSweater, { tempC: 3 });
    expect(outfit.layer).toBeNull();
  });

  it("null watch returns layer: null", () => {
    const outfit = buildOutfit(null, wardrobe, { tempC: 5 });
    expect(outfit.layer).toBeNull();
  });

  it("null watch returns all slots null including layer", () => {
    const outfit = buildOutfit(null, wardrobe);
    expect(outfit.shirt).toBeNull();
    expect(outfit.pants).toBeNull();
    expect(outfit.shoes).toBeNull();
    expect(outfit.jacket).toBeNull();
    expect(outfit.sweater).toBeNull();
    expect(outfit.layer).toBeNull();
  });
});

// ─── Shuffle exclusion ───────────────────────────────────────────────────────

describe("buildOutfit — shuffleExcluded prevents cycling", () => {
  it("respects excludedPerSlot: excluded shirt never appears", () => {
    const outfit1 = buildOutfit(laureato, wardrobe, { tempC: 15 });
    const excluded = { shirt: new Set([outfit1.shirt?.id]) };
    const outfit2 = buildOutfit(laureato, wardrobe, { tempC: 15 }, [], [], {}, excluded);
    if (wardrobe.filter(g => g.type === "shirt").length > 1) {
      expect(outfit2.shirt?.id).not.toBe(outfit1.shirt?.id);
    }
  });

  it("excludedPerSlot with all shirts excluded falls back gracefully", () => {
    const allShirtIds = new Set(wardrobe.filter(g => g.type === "shirt").map(g => g.id));
    const excluded = { shirt: allShirtIds };
    // Should not throw — returns null for shirt slot
    const outfit = buildOutfit(laureato, wardrobe, { tempC: 15 }, [], [], {}, excluded);
    expect(outfit.shirt).toBeNull();
    // Other slots unaffected
    expect(outfit.pants).not.toBeNull();
  });

  it("shuffle across 3 rounds produces 3 distinct shirts", () => {
    const shirts = wardrobe.filter(g => g.type === "shirt");
    if (shirts.length < 3) return; // fixture has 3, so this always runs

    const seen = new Set();
    const excluded = { shirt: new Set() };

    for (let round = 0; round < 3; round++) {
      const outfit = buildOutfit(laureato, wardrobe, { tempC: 15 }, [], [], {}, excluded);
      if (outfit.shirt) {
        seen.add(outfit.shirt.id);
        excluded.shirt.add(outfit.shirt.id);
      }
    }
    expect(seen.size).toBe(3);
  });
});

// ─── History store — notes + photos ─────────────────────────────────────────

describe("historyStore — log entry with notes and photos", () => {
  it("entry preserves notes and outfitPhotos fields", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    const store = useHistoryStore.getState();

    const entry = {
      id: "test-log-1",
      date: "2026-03-09",
      watchId: "laureato",
      garmentIds: ["sw1", "p1", "s1", "j1"],
      context: "clinic-hospital",
      notes: "Coat buttoned, cold morning",
      outfitPhoto: "data:image/jpeg;base64,abc",
      outfitPhotos: ["data:image/jpeg;base64,abc", "data:image/jpeg;base64,def"],
      loggedAt: "2026-03-09T07:02:00.000Z",
    };

    store.upsertEntry(entry);
    const saved = useHistoryStore.getState().entries.find(e => e.id === "test-log-1");

    expect(saved).toBeTruthy();
    expect(saved.notes).toBe("Coat buttoned, cold morning");
    expect(saved.outfitPhotos).toHaveLength(2);
    expect(saved.outfitPhoto).toBe("data:image/jpeg;base64,abc");
  });

  it("entry with null notes doesn't break", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    const store = useHistoryStore.getState();

    const entry = {
      id: "test-log-2",
      date: "2026-03-09",
      watchId: "laureato",
      garmentIds: ["sw1"],
      context: "casual",
      notes: null,
      outfitPhotos: null,
      loggedAt: "2026-03-09T08:00:00.000Z",
    };

    store.upsertEntry(entry);
    const saved = useHistoryStore.getState().entries.find(e => e.id === "test-log-2");
    expect(saved).toBeTruthy();
    expect(saved.notes).toBeNull();
    expect(saved.outfitPhotos).toBeNull();
  });

  it("upsertEntry updates notes on existing entry", async () => {
    const { useHistoryStore } = await import("../src/stores/historyStore.js");
    const store = useHistoryStore.getState();

    const id = "test-log-upsert";
    store.upsertEntry({ id, date: "2026-03-09", watchId: "laureato",
      garmentIds: [], context: "casual", notes: "original", loggedAt: new Date().toISOString() });

    store.upsertEntry({ id, date: "2026-03-09", watchId: "laureato",
      garmentIds: [], context: "casual", notes: "updated with coat buttoned", loggedAt: new Date().toISOString() });

    const saved = useHistoryStore.getState().entries.find(e => e.id === id);
    expect(saved.notes).toBe("updated with coat buttoned");
  });
});
