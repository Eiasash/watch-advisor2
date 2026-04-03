import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock idb with multi-store transaction support ────────────────────────────

let stateStore = new Map();
let imageStore = new Map();
let plannerStore = new Map();
let throwOnClear = false;

vi.mock("idb", () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: vi.fn((store, key) => {
      if (store === "state") return Promise.resolve(stateStore.get(key));
      if (store === "images") return Promise.resolve(imageStore.get(key));
      return Promise.resolve(undefined);
    }),
    put: vi.fn((store, value, key) => {
      if (store === "state") stateStore.set(key, value);
      if (store === "images") imageStore.set(key, value);
      if (store === "planner") plannerStore.set(key, value);
      return Promise.resolve();
    }),
    transaction: vi.fn((storeNames) => {
      const stores = {
        state: {
          clear: () => {
            if (throwOnClear) throw new Error("IDB clear error");
            stateStore.clear();
            return Promise.resolve();
          },
          getAllKeys: () => Promise.resolve([...stateStore.keys()]),
          delete: (key) => { stateStore.delete(key); return Promise.resolve(); },
        },
        images: {
          clear: () => {
            if (throwOnClear) throw new Error("IDB clear error");
            imageStore.clear();
            return Promise.resolve();
          },
          getAllKeys: () => Promise.resolve([...imageStore.keys()]),
          delete: (key) => { imageStore.delete(key); return Promise.resolve(); },
        },
        planner: {
          clear: () => {
            if (throwOnClear) throw new Error("IDB clear error");
            plannerStore.clear();
            return Promise.resolve();
          },
          getAllKeys: () => Promise.resolve([...plannerStore.keys()]),
          delete: (key) => { plannerStore.delete(key); return Promise.resolve(); },
        },
      };
      // Use a lazy getter so the rejection is only created when throwOnClear is true at access time
      const txObj = {
        objectStore: (name) => stores[name],
        store: stores[Array.isArray(storeNames) ? storeNames[0] : storeNames],
        get done() {
          return throwOnClear ? Promise.reject(new Error("IDB transaction error")) : Promise.resolve();
        },
      };
      return txObj;
    }),
  })),
}));

import { getCachedState, setCachedState, saveImage, clearCachedState } from "../src/services/localCache.js";

describe("clearCachedState", () => {
  beforeEach(() => {
    stateStore = new Map();
    imageStore = new Map();
    plannerStore = new Map();
    throwOnClear = false;
  });

  it("clears all three stores (state, images, planner)", async () => {
    // Populate stores
    stateStore.set("app", { garments: [{ id: "g1" }], watches: [{ id: "w1" }] });
    imageStore.set("g1", new Blob(["photo"]));
    plannerStore.set("week1", { plan: "test" });

    await clearCachedState();

    expect(stateStore.size).toBe(0);
    expect(imageStore.size).toBe(0);
    expect(plannerStore.size).toBe(0);
  });

  it("works when stores are already empty", async () => {
    await expect(clearCachedState()).resolves.not.toThrow();
    expect(stateStore.size).toBe(0);
  });

  it("after clear, getCachedState returns default empty state", async () => {
    stateStore.set("app", { garments: [{ id: "g1" }] });
    await clearCachedState();
    const state = await getCachedState();
    expect(state).toEqual({ watches: [], garments: [], history: [] });
  });

  it("after clear, new data can be written again", async () => {
    stateStore.set("app", { garments: [{ id: "old" }] });
    await clearCachedState();
    await setCachedState({ garments: [{ id: "new" }] });
    const stored = stateStore.get("app");
    expect(stored.garments).toEqual([{ id: "new" }]);
  });

  it("clears large number of images", async () => {
    for (let i = 0; i < 50; i++) {
      imageStore.set(`img-${i}`, new Blob([`data-${i}`]));
    }
    expect(imageStore.size).toBe(50);
    await clearCachedState();
    expect(imageStore.size).toBe(0);
  });

  it("throws when IDB transaction fails", async () => {
    throwOnClear = true;
    await expect(clearCachedState()).rejects.toThrow();
  });
});
