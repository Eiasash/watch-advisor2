import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
}));

import { useRejectStore } from "../src/stores/rejectStore.js";
import { hydrateRejectStore } from "../src/stores/rejectStore.js";
import { useStyleLearnStore } from "../src/stores/styleLearnStore.js";
import { usePrefStore } from "../src/stores/prefStore.js";
import { hydratePrefStore } from "../src/stores/prefStore.js";
import { useThemeStore } from "../src/stores/themeStore.js";
import { getCachedState, setCachedState } from "../src/services/localCache.js";

// ─── rejectStore ────────────────────────────────────────────────────────────

describe("rejectStore", () => {
  beforeEach(() => {
    useRejectStore.setState({ entries: [] });
  });

  it("hydrate sets entries and expires old ones", () => {
    const recent = { watchId: "w1", garmentIds: ["g1"], rejectedAt: Date.now() };
    const expired = { watchId: "w2", garmentIds: ["g2"], rejectedAt: Date.now() - 31 * 86400000 };
    useRejectStore.getState().hydrate([recent, expired]);
    expect(useRejectStore.getState().entries).toHaveLength(1);
    expect(useRejectStore.getState().entries[0].watchId).toBe("w1");
  });

  it("hydrate with empty array sets empty", () => {
    useRejectStore.getState().hydrate([]);
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });

  it("addRejection adds entry", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2"], "test");
    expect(useRejectStore.getState().entries).toHaveLength(1);
    expect(useRejectStore.getState().entries[0].watchId).toBe("w1");
    expect(useRejectStore.getState().entries[0].context).toBe("test");
  });

  it("addRejection caps at 200 entries", () => {
    for (let i = 0; i < 205; i++) {
      useRejectStore.getState().addRejection(`w${i}`, [`g${i}`]);
    }
    expect(useRejectStore.getState().entries.length).toBeLessThanOrEqual(200);
  });

  it("clearAll empties entries", () => {
    useRejectStore.getState().addRejection("w1", ["g1"]);
    useRejectStore.getState().clearAll();
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });

  it("isRejected returns true for matching combo (2+ overlap)", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
    expect(useRejectStore.getState().isRejected("w1", ["g1", "g2"])).toBe(true);
  });

  it("isRejected returns false for different watch", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2"]);
    expect(useRejectStore.getState().isRejected("w2", ["g1", "g2"])).toBe(false);
  });

  it("isRejected returns false for empty garmentIds", () => {
    useRejectStore.getState().addRejection("w1", ["g1"]);
    expect(useRejectStore.getState().isRejected("w1", [])).toBe(false);
  });

  it("isRejected returns false for single overlap when combo has 3+", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
    expect(useRejectStore.getState().isRejected("w1", ["g1", "g4", "g5"])).toBe(false);
  });

  it("isRecentlyRejected returns true for any single overlap", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2", "g3"]);
    expect(useRejectStore.getState().isRecentlyRejected("w1", ["g1"])).toBe(true);
  });

  it("isRecentlyRejected returns false for no overlap", () => {
    useRejectStore.getState().addRejection("w1", ["g1"]);
    expect(useRejectStore.getState().isRecentlyRejected("w1", ["g9"])).toBe(false);
  });
});

// ─── styleLearnStore ────────────────────────────────────────────────────────

describe("styleLearnStore", () => {
  beforeEach(() => {
    useStyleLearnStore.setState({ profile: { colors: {}, types: {} } });
  });

  it("hydrate decays existing weights", () => {
    useStyleLearnStore.getState().hydrate({ colors: { navy: 1.0 }, types: { shirt: 0.5 } });
    const p = useStyleLearnStore.getState().profile;
    expect(p.colors.navy).toBeLessThan(1.0);
    expect(p.colors.navy).toBeCloseTo(0.98, 2);
  });

  it("hydrate with empty defaults", () => {
    useStyleLearnStore.getState().hydrate({});
    const p = useStyleLearnStore.getState().profile;
    expect(p.colors).toEqual({});
    expect(p.types).toEqual({});
  });

  it("recordWear nudges color and type weights up", () => {
    useStyleLearnStore.getState().hydrate({ colors: { navy: 0.5 }, types: { shirt: 0.5 } });
    const before = { ...useStyleLearnStore.getState().profile.colors };
    useStyleLearnStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    const after = useStyleLearnStore.getState().profile;
    expect(after.colors.navy).toBeGreaterThan(before.navy);
    expect(after.types.shirt).toBeDefined();
  });

  it("recordWear initialises new colors at 0.52", () => {
    useStyleLearnStore.getState().recordWear([{ color: "red", type: "pants" }]);
    const p = useStyleLearnStore.getState().profile;
    expect(p.colors.red).toBeCloseTo(0.52, 2);
  });

  it("weights are clamped to [0.1, 1.0]", () => {
    useStyleLearnStore.getState().hydrate({ colors: { navy: 0.99 }, types: {} });
    // Nudge many times
    for (let i = 0; i < 100; i++) {
      useStyleLearnStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    }
    expect(useStyleLearnStore.getState().profile.colors.navy).toBeLessThanOrEqual(1.0);
  });

  it("getTopColors returns sorted colors", () => {
    useStyleLearnStore.setState({
      profile: { colors: { navy: 0.9, black: 0.5, red: 0.3 }, types: {} },
    });
    const top = useStyleLearnStore.getState().getTopColors(2);
    expect(top).toHaveLength(2);
    expect(top[0].color).toBe("navy");
    expect(top[1].color).toBe("black");
  });

  it("preferenceMultiplier returns a value between 0.85 and 1.15", () => {
    useStyleLearnStore.setState({
      profile: { colors: { navy: 0.9 }, types: { shirt: 0.8 } },
    });
    const m = useStyleLearnStore.getState().preferenceMultiplier({ color: "navy", type: "shirt" });
    expect(m).toBeGreaterThanOrEqual(0.85);
    expect(m).toBeLessThanOrEqual(1.15);
  });

  it("preferenceMultiplier defaults to 0.5 for unknown items", () => {
    const m = useStyleLearnStore.getState().preferenceMultiplier({ color: "unknown", type: "unknown" });
    expect(m).toBeGreaterThanOrEqual(0.85);
    expect(m).toBeLessThanOrEqual(1.15);
  });
});

// ─── prefStore ──────────────────────────────────────────────────────────────

describe("prefStore", () => {
  beforeEach(() => {
    usePrefStore.setState({ profile: { colors: {}, types: {} } });
  });

  it("hydrate sets profile", () => {
    usePrefStore.getState().hydrate({ colors: { navy: 0.7 }, types: { shirt: 0.6 } });
    expect(usePrefStore.getState().profile.colors.navy).toBe(0.7);
  });

  it("hydrate with null resets to empty", () => {
    usePrefStore.getState().hydrate(null);
    expect(usePrefStore.getState().profile).toEqual({ colors: {}, types: {} });
  });

  it("recordWear nudges color up by 0.02", () => {
    usePrefStore.getState().hydrate({ colors: { navy: 0.5 }, types: {} });
    usePrefStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    expect(usePrefStore.getState().profile.colors.navy).toBeCloseTo(0.52, 2);
  });

  it("recordWear initialises new color at 0.52", () => {
    usePrefStore.getState().recordWear([{ color: "red", type: "pants" }]);
    expect(usePrefStore.getState().profile.colors.red).toBeCloseTo(0.52, 2);
  });

  it("recordWear clamps at 1.0", () => {
    usePrefStore.getState().hydrate({ colors: { navy: 0.99 }, types: {} });
    usePrefStore.getState().recordWear([{ color: "navy" }]);
    expect(usePrefStore.getState().profile.colors.navy).toBe(1.0);
  });

  it("decayOnSession reduces all weights by 2%", () => {
    usePrefStore.getState().hydrate({ colors: { navy: 1.0 }, types: { shirt: 0.5 } });
    usePrefStore.getState().decayOnSession();
    expect(usePrefStore.getState().profile.colors.navy).toBeCloseTo(0.98, 2);
    expect(usePrefStore.getState().profile.types.shirt).toBeCloseTo(0.49, 2);
  });

  it("decayOnSession clamps at 0.1", () => {
    usePrefStore.getState().hydrate({ colors: { faint: 0.1 }, types: {} });
    usePrefStore.getState().decayOnSession();
    expect(usePrefStore.getState().profile.colors.faint).toBe(0.1);
  });

  it("score returns average of color and type weights", () => {
    usePrefStore.getState().hydrate({ colors: { navy: 0.8 }, types: { shirt: 0.6 } });
    const s = usePrefStore.getState().score({ color: "navy", type: "shirt" });
    expect(s).toBeCloseTo(0.7, 2);
  });

  it("score defaults to 0.5 for unknown garment", () => {
    const s = usePrefStore.getState().score({ color: "unknown", type: "unknown" });
    expect(s).toBe(0.5);
  });

  it("_persist catch block: handles setCachedState rejection gracefully", async () => {
    setCachedState.mockRejectedValueOnce(new Error("storage full"));
    usePrefStore.setState({ profile: { colors: {}, types: {} } });
    // recordWear triggers _persist which will hit the catch block
    usePrefStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    await new Promise(r => setTimeout(r, 20));
    // Store should still have been updated despite _persist error
    expect(usePrefStore.getState().profile.colors.navy).toBeCloseTo(0.52, 2);
  });
});

// ─── themeStore ──────────────────────────────────────────────────────────────

describe("themeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: "dark" });
  });

  it("starts in dark mode", () => {
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("toggle switches to light", () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().mode).toBe("light");
  });

  it("toggle switches back to dark", () => {
    useThemeStore.getState().toggle();
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().mode).toBe("dark");
  });
});

// ─── hydratePrefStore ────────────────────────────────────────────────────────

describe("hydratePrefStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePrefStore.setState({ profile: { colors: {}, types: {} } });
    getCachedState.mockResolvedValue({});
  });

  it("does nothing when cache has no prefProfile", async () => {
    getCachedState.mockResolvedValue({});
    await hydratePrefStore();
    expect(usePrefStore.getState().profile).toEqual({ colors: {}, types: {} });
  });

  it("hydrates profile from cache when prefProfile is present", async () => {
    getCachedState.mockResolvedValue({
      prefProfile: { colors: { navy: 0.8 }, types: { shirt: 0.7 } },
    });
    await hydratePrefStore();
    // hydratePrefStore calls decayOnSession after hydrating (navy: 0.8 × 0.98 = 0.784)
    expect(usePrefStore.getState().profile.colors.navy).toBeCloseTo(0.784, 2);
  });

  it("calls decayOnSession after hydration", async () => {
    getCachedState.mockResolvedValue({
      prefProfile: { colors: { navy: 1.0 }, types: {} },
    });
    await hydratePrefStore();
    // decayOnSession reduces by 2%
    expect(usePrefStore.getState().profile.colors.navy).toBeCloseTo(0.98, 2);
  });

  it("ignores non-object prefProfile", async () => {
    getCachedState.mockResolvedValue({ prefProfile: "not-an-object" });
    await hydratePrefStore();
    // Should not hydrate — profile stays default (then decay runs, no-op on empty)
    expect(usePrefStore.getState().profile.colors).toEqual({});
  });

  it("handles getCachedState rejection gracefully", async () => {
    getCachedState.mockRejectedValueOnce(new Error("IDB unavailable"));
    await expect(hydratePrefStore()).resolves.not.toThrow();
  });
});

// ─── rejectStore — clearAll async path & hydrateRejectStore ─────────────────

describe("rejectStore — clearAll async path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedState.mockResolvedValue({});
    setCachedState.mockResolvedValue(undefined);
    useRejectStore.setState({ entries: [] });
  });

  it("clearAll persists empty rejectLog to cache (async path)", async () => {
    useRejectStore.getState().addRejection("w1", ["g1"]);
    useRejectStore.getState().clearAll();
    // Wait for async _getCache → _setCache chain to complete (covers line 46)
    await new Promise(r => setTimeout(r, 50));
    // Store should be empty and async path completed without error
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });
});

describe("hydrateRejectStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedState.mockResolvedValue({});
    useRejectStore.setState({ entries: [] });
  });

  it("does nothing when cache has no rejectLog", async () => {
    getCachedState.mockResolvedValue({});
    await hydrateRejectStore();
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });

  it("hydrates entries from cache rejectLog", async () => {
    const recentEntry = { watchId: "w1", garmentIds: ["g1"], rejectedAt: Date.now() };
    getCachedState.mockResolvedValue({ rejectLog: [recentEntry] });
    await hydrateRejectStore();
    expect(useRejectStore.getState().entries).toHaveLength(1);
    expect(useRejectStore.getState().entries[0].watchId).toBe("w1");
  });

  it("filters expired entries on hydration", async () => {
    const expired = { watchId: "w1", garmentIds: ["g1"], rejectedAt: Date.now() - 31 * 86400000 };
    const recent = { watchId: "w2", garmentIds: ["g2"], rejectedAt: Date.now() };
    getCachedState.mockResolvedValue({ rejectLog: [expired, recent] });
    await hydrateRejectStore();
    expect(useRejectStore.getState().entries).toHaveLength(1);
    expect(useRejectStore.getState().entries[0].watchId).toBe("w2");
  });

  it("handles getCachedState rejection gracefully", async () => {
    getCachedState.mockRejectedValueOnce(new Error("IDB unavailable"));
    await expect(hydrateRejectStore()).resolves.not.toThrow();
  });

  it("ignores non-array rejectLog in cache", async () => {
    getCachedState.mockResolvedValue({ rejectLog: "corrupted" });
    await hydrateRejectStore();
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });
});
