import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock idb before importing localCache
const mockStore = new Map();
const mockImageStore = new Map();

vi.mock("idb", () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn((store, key) => {
      if (store === "state") return Promise.resolve(mockStore.get(key));
      if (store === "images") return Promise.resolve(mockImageStore.get(key));
    }),
    put: vi.fn((store, value, key) => {
      if (store === "state") mockStore.set(key, value);
      if (store === "images") mockImageStore.set(key, value);
      return Promise.resolve();
    }),
    transaction: vi.fn((storeName, mode) => {
      const deletedKeys = [];
      return {
        store: {
          getAllKeys: () => Promise.resolve([...mockImageStore.keys()]),
          delete: (key) => { mockImageStore.delete(key); deletedKeys.push(key); return Promise.resolve(); },
        },
        done: Promise.resolve(),
      };
    }),
  })),
}));

import { getCachedState, setCachedState, saveImage, getImage, evictOrphanImages } from "../src/services/localCache.js";

describe("localCache", () => {
  beforeEach(() => {
    mockStore.clear();
    mockImageStore.clear();
  });

  // ─── getCachedState ────────────────────────────────────────────────────
  it("returns default state when no data stored", async () => {
    const state = await getCachedState();
    expect(state).toEqual({ watches: [], garments: [], history: [] });
  });

  it("returns stored state", async () => {
    mockStore.set("app", { garments: [{ id: "g1" }], watches: [], history: [] });
    const state = await getCachedState();
    expect(state.garments).toHaveLength(1);
  });

  // ─── setCachedState ────────────────────────────────────────────────────
  it("merges partial state without clobbering existing keys", async () => {
    mockStore.set("app", { garments: [{ id: "g1" }], watches: [{ id: "w1" }] });
    await setCachedState({ garments: [{ id: "g2" }] });
    const stored = mockStore.get("app");
    expect(stored.garments).toEqual([{ id: "g2" }]);
    expect(stored.watches).toEqual([{ id: "w1" }]);
  });

  it("creates state from empty when nothing exists", async () => {
    await setCachedState({ garments: [{ id: "g1" }] });
    const stored = mockStore.get("app");
    expect(stored.garments).toEqual([{ id: "g1" }]);
  });

  // ─── saveImage / getImage ──────────────────────────────────────────────
  it("saveImage stores and getImage retrieves", async () => {
    const blob = new Blob(["test"]);
    await saveImage("img1", blob);
    const result = await getImage("img1");
    expect(result).toBe(blob);
  });

  it("getImage returns undefined for missing key", async () => {
    const result = await getImage("nonexistent");
    expect(result).toBeUndefined();
  });

  // ─── evictOrphanImages ─────────────────────────────────────────────────
  it("evicts images not in the existing IDs set", async () => {
    mockImageStore.set("g1", "blob1");
    mockImageStore.set("g2", "blob2");
    mockImageStore.set("g3", "blob3");
    await evictOrphanImages(new Set(["g1", "g3"]));
    expect(mockImageStore.has("g1")).toBe(true);
    expect(mockImageStore.has("g2")).toBe(false);
    expect(mockImageStore.has("g3")).toBe(true);
  });

  it("evicts all images when existingIds is empty", async () => {
    mockImageStore.set("g1", "blob1");
    mockImageStore.set("g2", "blob2");
    await evictOrphanImages(new Set());
    expect(mockImageStore.size).toBe(0);
  });

  it("does nothing when no images stored", async () => {
    await evictOrphanImages(new Set(["g1"]));
    expect(mockImageStore.size).toBe(0);
  });
});
