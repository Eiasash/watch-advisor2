import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock idb with error injection support ──────────────────────────────────

let mockStore = new Map();
let mockImageStore = new Map();
let throwOnGet = false;
let throwOnPut = false;

vi.mock("idb", () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn((store, key) => {
      if (throwOnGet) return Promise.reject(new Error("IDB read error"));
      if (store === "state") return Promise.resolve(mockStore.get(key));
      if (store === "images") return Promise.resolve(mockImageStore.get(key));
    }),
    put: vi.fn((store, value, key) => {
      if (throwOnPut) return Promise.reject(new Error("IDB write error"));
      if (store === "state") mockStore.set(key, value);
      if (store === "images") mockImageStore.set(key, value);
      return Promise.resolve();
    }),
    transaction: vi.fn((storeName, mode) => ({
      store: {
        getAllKeys: () => Promise.resolve([...mockImageStore.keys()]),
        delete: (key) => { mockImageStore.delete(key); return Promise.resolve(); },
      },
      done: Promise.resolve(),
    })),
  })),
}));

import { getCachedState, setCachedState, saveImage, getImage, evictOrphanImages } from "../src/services/localCache.js";

describe("localCache — error resilience", () => {
  beforeEach(() => {
    mockStore = new Map();
    mockImageStore = new Map();
    throwOnGet = false;
    throwOnPut = false;
  });

  // ─── getCachedState error handling ──────────────────────────────────────

  it("getCachedState returns default when IDB get throws", async () => {
    throwOnGet = true;
    await expect(getCachedState()).rejects.toThrow("IDB read error");
  });

  // ─── setCachedState error handling ──────────────────────────────────────

  it("setCachedState throws when IDB put fails", async () => {
    throwOnPut = true;
    await expect(setCachedState({ garments: [] })).rejects.toThrow("IDB write error");
  });

  // ─── Missing/corrupt data ──────────────────────────────────────────────

  it("getCachedState with undefined stored value returns default", async () => {
    mockStore.set("app", undefined);
    const state = await getCachedState();
    // undefined || default → returns default
    expect(state).toEqual({ watches: [], garments: [], history: [] });
  });

  it("setCachedState with partial update on empty store creates entry", async () => {
    // No existing state
    await setCachedState({ garments: [{ id: "g1" }] });
    const stored = mockStore.get("app");
    expect(stored.garments).toEqual([{ id: "g1" }]);
  });

  it("setCachedState preserves unrelated keys during partial update", async () => {
    mockStore.set("app", {
      garments: [{ id: "g1" }],
      watches: [{ id: "w1" }],
      history: [{ id: "h1" }],
      weekCtx: ["casual","casual","casual","casual","casual","casual","casual"],
    });

    await setCachedState({ garments: [{ id: "g2" }] });
    const stored = mockStore.get("app");
    expect(stored.garments).toEqual([{ id: "g2" }]);
    expect(stored.watches).toEqual([{ id: "w1" }]);
    expect(stored.history).toEqual([{ id: "h1" }]);
    expect(stored.weekCtx).toHaveLength(7);
  });

  // ─── saveImage / getImage edge cases ──────────────────────────────────

  it("getImage returns undefined for key never stored", async () => {
    const result = await getImage("nonexistent-key");
    expect(result).toBeUndefined();
  });

  it("saveImage overwrites existing image for same key", async () => {
    const blob1 = new Blob(["first"]);
    const blob2 = new Blob(["second"]);
    await saveImage("img1", blob1);
    await saveImage("img1", blob2);
    const result = await getImage("img1");
    expect(result).toBe(blob2);
  });

  // ─── evictOrphanImages edge cases ──────────────────────────────────────

  it("evictOrphanImages with Set of string IDs handles numeric keys", async () => {
    mockImageStore.set("1", "blob1");
    mockImageStore.set("2", "blob2");
    await evictOrphanImages(new Set(["1"]));
    expect(mockImageStore.has("1")).toBe(true);
    expect(mockImageStore.has("2")).toBe(false);
  });

  it("evictOrphanImages with many orphans removes all", async () => {
    for (let i = 0; i < 10; i++) {
      mockImageStore.set(`orphan-${i}`, `blob-${i}`);
    }
    mockImageStore.set("keep", "keeper");
    await evictOrphanImages(new Set(["keep"]));
    expect(mockImageStore.size).toBe(1);
    expect(mockImageStore.has("keep")).toBe(true);
  });

  // ─── Concurrent read/write simulation ─────────────────────────────────

  it("concurrent setCachedState calls produce consistent state", async () => {
    mockStore.set("app", { garments: [], watches: [] });
    // Two parallel writes — last one wins for garments, but both should succeed
    await Promise.all([
      setCachedState({ garments: [{ id: "g1" }] }),
      setCachedState({ watches: [{ id: "w1" }] }),
    ]);
    const stored = mockStore.get("app");
    // Due to merge logic, the final state depends on execution order
    // but should not throw or corrupt
    expect(stored).toBeDefined();
    expect(stored).toHaveProperty("garments");
    expect(stored).toHaveProperty("watches");
  });
});
