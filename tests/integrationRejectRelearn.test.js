import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test: reject-and-relearn flow
 * Tests: rejectStore.addRejection → isRejected → styleLearnStore.recordWear → preferenceMultiplier
 */

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({}),
  setCachedState: vi.fn().mockResolvedValue(undefined),
}));

import { useRejectStore } from "../src/stores/rejectStore.js";
import { useStyleLearnStore } from "../src/stores/styleLearnStore.js";

describe("integration — reject and relearn flow", () => {
  beforeEach(() => {
    useRejectStore.setState({ entries: [] });
    useStyleLearnStore.setState({ profile: { colors: {}, types: {} } });
  });

  // ─── Rejection tracking ─────────────────────────────────────────────────

  it("rejected outfit is detected by isRejected", () => {
    useRejectStore.getState().addRejection("snowflake", ["g1", "g2", "g3"], "too casual");

    // Check with 2+ overlapping garments → detected
    const rejected = useRejectStore.getState().isRejected("snowflake", ["g1", "g2", "g4"]);
    expect(rejected).toBe(true);
  });

  it("rejection requires at least 2 overlapping garments for isRejected", () => {
    useRejectStore.getState().addRejection("snowflake", ["g1", "g2", "g3"], "test");

    // Only 1 overlap → not detected by isRejected
    const rejected = useRejectStore.getState().isRejected("snowflake", ["g1", "g4", "g5"]);
    expect(rejected).toBe(false);
  });

  it("isRecentlyRejected requires only 1 overlapping garment", () => {
    useRejectStore.getState().addRejection("snowflake", ["g1", "g2"], "test");

    // 1 overlap → detected by isRecentlyRejected
    const rejected = useRejectStore.getState().isRecentlyRejected("snowflake", ["g1", "g99"]);
    expect(rejected).toBe(true);
  });

  it("different watch ID → not rejected", () => {
    useRejectStore.getState().addRejection("snowflake", ["g1", "g2"], "test");
    const rejected = useRejectStore.getState().isRejected("submariner", ["g1", "g2"]);
    expect(rejected).toBe(false);
  });

  it("empty garmentIds → not rejected", () => {
    useRejectStore.getState().addRejection("snowflake", ["g1", "g2"], "test");
    const rejected = useRejectStore.getState().isRejected("snowflake", []);
    expect(rejected).toBe(false);
  });

  // ─── Rejection expiry (30-day TTL) ──────────────────────────────────────

  it("expired entries are filtered on hydrate", () => {
    const oldEntry = {
      watchId: "snowflake",
      garmentIds: ["g1", "g2"],
      context: "expired",
      rejectedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
    };
    const freshEntry = {
      watchId: "submariner",
      garmentIds: ["g3", "g4"],
      context: "fresh",
      rejectedAt: Date.now() - 1000, // 1 second ago
    };

    useRejectStore.getState().hydrate([oldEntry, freshEntry]);
    expect(useRejectStore.getState().entries).toHaveLength(1);
    expect(useRejectStore.getState().entries[0].watchId).toBe("submariner");
  });

  // ─── 200-entry cap ────────────────────────────────────────────────────────

  it("caps at 200 entries", () => {
    for (let i = 0; i < 210; i++) {
      useRejectStore.getState().addRejection("w1", [`g${i}`], `test-${i}`);
    }
    expect(useRejectStore.getState().entries.length).toBeLessThanOrEqual(200);
  });

  // ─── clearAll ─────────────────────────────────────────────────────────────

  it("clearAll removes all entries", () => {
    useRejectStore.getState().addRejection("w1", ["g1", "g2"], "test");
    useRejectStore.getState().addRejection("w2", ["g3", "g4"], "test");
    useRejectStore.getState().clearAll();
    expect(useRejectStore.getState().entries).toHaveLength(0);
  });

  // ─── Style learning: wear recording ─────────────────────────────────────

  it("recordWear nudges color and type weights upward", () => {
    useStyleLearnStore.getState().recordWear([
      { color: "navy", type: "shirt" },
      { color: "grey", type: "pants" },
    ]);

    const profile = useStyleLearnStore.getState().profile;
    expect(profile.colors.navy).toBeGreaterThan(0.5);
    expect(profile.colors.grey).toBeGreaterThan(0.5);
    expect(profile.types.shirt).toBeGreaterThan(0.5);
    expect(profile.types.pants).toBeGreaterThan(0.5);
  });

  it("repeated wear increases weight further", () => {
    for (let i = 0; i < 5; i++) {
      useStyleLearnStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    }
    const profile = useStyleLearnStore.getState().profile;
    expect(profile.colors.navy).toBeGreaterThan(0.55);
  });

  it("weight is clamped at 1.0", () => {
    for (let i = 0; i < 100; i++) {
      useStyleLearnStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    }
    const profile = useStyleLearnStore.getState().profile;
    expect(profile.colors.navy).toBeLessThanOrEqual(1.0);
    expect(profile.types.shirt).toBeLessThanOrEqual(1.0);
  });

  // ─── preferenceMultiplier ──────────────────────────────────────────────

  it("preferenceMultiplier returns value in [0.85, 1.15] range", () => {
    useStyleLearnStore.getState().recordWear([
      { color: "navy", type: "shirt" },
    ]);

    const mult = useStyleLearnStore.getState().preferenceMultiplier({
      color: "navy",
      type: "shirt",
    });
    expect(mult).toBeGreaterThanOrEqual(0.85);
    expect(mult).toBeLessThanOrEqual(1.15);
  });

  it("unknown garment gets neutral multiplier around 0.98", () => {
    const mult = useStyleLearnStore.getState().preferenceMultiplier({
      color: "turquoise",
      type: "hat",
    });
    // default weight 0.5 → raw = 0.5*0.6 + 0.5*0.4 = 0.5
    // multiplier = 0.85 + (0.5 - 0.1) / 0.9 * 0.30 ≈ 0.983
    expect(mult).toBeCloseTo(0.983, 1);
  });

  it("heavily worn garment gets higher multiplier", () => {
    for (let i = 0; i < 20; i++) {
      useStyleLearnStore.getState().recordWear([{ color: "navy", type: "shirt" }]);
    }
    const mult = useStyleLearnStore.getState().preferenceMultiplier({
      color: "navy",
      type: "shirt",
    });
    expect(mult).toBeGreaterThan(1.0);
  });

  // ─── Hydration decay ──────────────────────────────────────────────────

  it("hydrate decays all weights by 0.98", () => {
    useStyleLearnStore.getState().hydrate({
      colors: { navy: 1.0, grey: 0.8 },
      types: { shirt: 1.0 },
    });
    const profile = useStyleLearnStore.getState().profile;
    expect(profile.colors.navy).toBeCloseTo(0.98, 2);
    expect(profile.colors.grey).toBeCloseTo(0.784, 2);
    expect(profile.types.shirt).toBeCloseTo(0.98, 2);
  });

  it("decay does not go below 0.1", () => {
    useStyleLearnStore.getState().hydrate({
      colors: { rare: 0.1 },
      types: {},
    });
    const profile = useStyleLearnStore.getState().profile;
    expect(profile.colors.rare).toBeGreaterThanOrEqual(0.1);
  });

  // ─── getTopColors ─────────────────────────────────────────────────────

  it("getTopColors returns sorted by weight", () => {
    useStyleLearnStore.getState().hydrate({
      colors: { navy: 0.9, grey: 0.7, black: 0.5, white: 0.3 },
      types: {},
    });
    const top = useStyleLearnStore.getState().getTopColors(3);
    expect(top).toHaveLength(3);
    expect(top[0].color).toBe("navy");
    expect(top[0].weight).toBeGreaterThan(top[1].weight);
  });
});
