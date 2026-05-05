import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.js — the key parameter fix is what we're testing
const _store = new Map();
const mockDb = {
  put: vi.fn((store, value, key) => { _store.set(`${store}:${key}`, value); return Promise.resolve(); }),
  get: vi.fn((store, key) => Promise.resolve(_store.get(`${store}:${key}`))),
  // Transaction-mode support — May 5 2026 lost-update race fix wraps
  // patchBlob's read+write in a single tx so concurrent settings saves
  // don't drop each other's fields.
  transaction: vi.fn((storeName, _mode) => ({
    store: {
      get: (key) => Promise.resolve(_store.get(`${storeName}:${key}`)),
      put: (value, key) => { _store.set(`${storeName}:${key}`, value); return Promise.resolve(); },
    },
    done: Promise.resolve(),
  })),
};
vi.mock("../src/services/db.js", () => ({
  db: mockDb,
}));

// Mock wardrobeStore
const mockWardrobeState = { weekCtx: [], onCallDates: [] };
vi.mock("../src/stores/wardrobeStore.js", () => ({
  useWardrobeStore: {
    setState: vi.fn((patch) => Object.assign(mockWardrobeState, patch)),
    getState: () => mockWardrobeState,
  },
}));

// Mock strapStore
const mockStrapState = { activeStrap: {} };
vi.mock("../src/stores/strapStore.js", () => ({
  useStrapStore: {
    setState: vi.fn((updater) => {
      if (typeof updater === "function") {
        Object.assign(mockStrapState, updater(mockStrapState));
      } else {
        Object.assign(mockStrapState, updater);
      }
    }),
    getState: () => mockStrapState,
  },
}));

const { saveWeekCtx, saveOnCallDates, saveActiveStrap, saveOutfitOverrides } =
  await import("../src/services/persistence/settingsPersistence.js");

describe("settingsPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _store.clear();
    Object.assign(mockWardrobeState, { weekCtx: [], onCallDates: [] });
    Object.assign(mockStrapState, { activeStrap: {} });
  });

  // ── saveWeekCtx ─────────────────────────────────────────────────────────

  describe("saveWeekCtx", () => {
    it("persists weekCtx to IDB with 'app' key", async () => {
      const ctx = ["casual", "smart-casual", "formal", "casual", "casual", "casual", "casual"];
      await saveWeekCtx(ctx);
      // Verify the data landed under the expected key. The May 5 2026
      // race fix migrated patchBlob from `db.put` to a tx-wrapped
      // `tx.store.put`, so we assert on the resulting store state
      // rather than the mock call signature (which was specific to the
      // pre-tx code path).
      expect(_store.get("state:app")).toBeDefined();
      expect(_store.get("state:app").weekCtx).toEqual(ctx);
    });

    it("updates wardrobeStore state", async () => {
      const ctx = ["shift", "smart-casual"];
      await saveWeekCtx(ctx);
      expect(mockWardrobeState.weekCtx).toEqual(ctx);
    });

    it("merges with existing blob (does not clobber other fields)", async () => {
      _store.set("state:app", { onCallDates: ["2026-04-10"], garments: [] });
      await saveWeekCtx(["formal"]);
      const stored = _store.get("state:app");
      expect(stored.weekCtx).toEqual(["formal"]);
      expect(stored.onCallDates).toEqual(["2026-04-10"]);
    });
  });

  // ── saveOnCallDates ───────────────────────────────────────────────────────

  describe("saveOnCallDates", () => {
    it("persists onCallDates to IDB", async () => {
      await saveOnCallDates(["2026-04-10", "2026-04-11"]);
      const stored = _store.get("state:app");
      expect(stored.onCallDates).toEqual(["2026-04-10", "2026-04-11"]);
    });

    it("updates wardrobeStore state", async () => {
      await saveOnCallDates(["2026-04-15"]);
      expect(mockWardrobeState.onCallDates).toEqual(["2026-04-15"]);
    });
  });

  // ── saveActiveStrap ───────────────────────────────────────────────────────

  describe("saveActiveStrap", () => {
    it("persists active strap per watch", async () => {
      await saveActiveStrap("rolex-sub", "strap-rubber");
      const stored = _store.get("state:app");
      expect(stored.strapStore.activeStrap["rolex-sub"]).toBe("strap-rubber");
    });

    it("preserves existing strap selections", async () => {
      _store.set("state:app", { strapStore: { activeStrap: { "omega-sm": "strap-nato" } } });
      await saveActiveStrap("rolex-sub", "strap-rubber");
      const stored = _store.get("state:app");
      expect(stored.strapStore.activeStrap["omega-sm"]).toBe("strap-nato");
      expect(stored.strapStore.activeStrap["rolex-sub"]).toBe("strap-rubber");
    });

    it("updates strapStore state", async () => {
      await saveActiveStrap("w1", "s1");
      expect(mockStrapState.activeStrap["w1"]).toBe("s1");
    });
  });

  // ── saveOutfitOverrides ───────────────────────────────────────────────────

  describe("saveOutfitOverrides", () => {
    it("persists outfit overrides to IDB", async () => {
      const overrides = { "2026-04-10": { shirt: "g1" } };
      await saveOutfitOverrides(overrides);
      const stored = _store.get("state:app");
      expect(stored._outfitOverrides).toEqual(overrides);
    });
  });

  // ── Bug regression: data must land under (store='state', key='app') ─────
  //
  // Original bug: db.put was called without the key parameter, so writes
  // landed under the wrong key. The May 5 2026 race fix moved patchBlob
  // to a transaction-wrapped tx.store.put — the regression contract is
  // unchanged (data must end up at state:app) but the call path differs.
  // We now assert on the post-write store state rather than the specific
  // call signature.
  describe("key parameter regression", () => {
    it("data lands under store='state', key='app'", async () => {
      await saveWeekCtx(["casual"]);
      expect(_store.has("state:app")).toBe(true);
      expect(_store.get("state:app").weekCtx).toEqual(["casual"]);
    });
  });
});
