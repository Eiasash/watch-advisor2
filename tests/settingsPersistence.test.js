import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.js — the key parameter fix is what we're testing
const _store = new Map();
const mockDb = {
  put: vi.fn((store, value, key) => { _store.set(`${store}:${key}`, value); return Promise.resolve(); }),
  get: vi.fn((store, key) => Promise.resolve(_store.get(`${store}:${key}`))),
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
      // Verify db.put was called with the key parameter
      expect(mockDb.put).toHaveBeenCalled();
      const [store, , key] = mockDb.put.mock.calls[0];
      expect(store).toBe("state");
      expect(key).toBe("app");
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

  // ── Bug regression: key parameter must be passed to db.put ──────────────

  describe("key parameter regression", () => {
    it("db.put is always called with 3 args (store, value, key)", async () => {
      await saveWeekCtx(["casual"]);
      const call = mockDb.put.mock.calls[0];
      expect(call).toHaveLength(3);
      expect(call[2]).toBe("app");
    });
  });
});
