import { describe, it, expect, beforeEach } from "vitest";
import { setScoringOverrides, getOverride, getAllOverrides } from "../src/config/scoringOverrides.js";

describe("scoringOverrides", () => {
  beforeEach(() => {
    setScoringOverrides({});
  });

  it("returns default when no override set", () => {
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
    expect(getOverride("repetitionPenalty", -0.28)).toBe(-0.28);
  });

  it("returns override when set", () => {
    setScoringOverrides({ rotationFactor: 0.45 });
    expect(getOverride("rotationFactor", 0.40)).toBe(0.45);
    expect(getOverride("repetitionPenalty", -0.28)).toBe(-0.28); // still default
  });

  it("ignores non-numeric overrides", () => {
    setScoringOverrides({ rotationFactor: "bad", repetitionPenalty: -0.31 });
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
    expect(getOverride("repetitionPenalty", -0.28)).toBe(-0.31);
  });

  it("handles null/undefined input", () => {
    setScoringOverrides(null);
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
    setScoringOverrides(undefined);
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
  });

  it("getAllOverrides returns current state", () => {
    setScoringOverrides({ rotationFactor: 0.50, _lastTuned: "2026-04-06" });
    const all = getAllOverrides();
    expect(all.rotationFactor).toBe(0.50);
    expect(all._lastTuned).toBe("2026-04-06");
  });
});

describe("rotationFactor with overrides", () => {
  beforeEach(() => {
    setScoringOverrides({});
  });

  it("uses default 0.40 weight when no override", async () => {
    const { default: rotationFactor } = await import("../src/outfitEngine/scoringFactors/rotationFactor.js");
    const result = rotationFactor({ garment: { id: "test" } }, { history: [] });
    // With empty history, garmentDaysIdle returns Infinity, rotationPressure(Infinity) = 0.50
    // 0.50 * 0.40 = 0.20
    expect(result).toBeCloseTo(0.20, 1);
  });

  it("uses overridden weight when set", async () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    const { default: rotationFactor } = await import("../src/outfitEngine/scoringFactors/rotationFactor.js");
    const result = rotationFactor({ garment: { id: "test" } }, { history: [] });
    // 0.50 * 0.55 = 0.275
    expect(result).toBeCloseTo(0.275, 1);
  });
});

describe("repetitionPenalty with overrides", () => {
  beforeEach(() => {
    setScoringOverrides({});
  });

  it("uses default -0.28 when no override", async () => {
    const { repetitionPenalty } = await import("../src/domain/contextMemory.js");
    const history = [{ garmentIds: ["g1", "g2"] }];
    expect(repetitionPenalty("g1", history)).toBe(-0.28);
    expect(repetitionPenalty("g99", history)).toBe(0);
  });

  it("uses overridden penalty when set", async () => {
    setScoringOverrides({ repetitionPenalty: -0.35 });
    const { repetitionPenalty } = await import("../src/domain/contextMemory.js");
    const history = [{ garmentIds: ["g1"] }];
    expect(repetitionPenalty("g1", history)).toBe(-0.35);
  });
});

describe("rotationPressure with overrides", () => {
  beforeEach(() => {
    setScoringOverrides({});
  });

  it("returns default 0.50 for never-worn (Infinity)", async () => {
    const { rotationPressure } = await import("../src/domain/rotationStats.js");
    expect(rotationPressure(Infinity)).toBe(0.50);
  });

  it("returns overridden value for never-worn", async () => {
    setScoringOverrides({ neverWornRotationPressure: 0.65 });
    const { rotationPressure } = await import("../src/domain/rotationStats.js");
    expect(rotationPressure(Infinity)).toBe(0.65);
  });

  it("logistic curve unaffected by overrides for finite values", async () => {
    setScoringOverrides({ neverWornRotationPressure: 0.90 });
    const { rotationPressure } = await import("../src/domain/rotationStats.js");
    // daysIdle=14 is the midpoint → should be ~0.50
    expect(rotationPressure(14)).toBeCloseTo(0.50, 1);
    // daysIdle=0 → very low
    expect(rotationPressure(0)).toBeLessThan(0.10);
  });
});

describe("rejectStore with reasons", () => {
  it("stores rejection reason and slot", async () => {
    const { useRejectStore } = await import("../src/stores/rejectStore.js");
    useRejectStore.setState({ entries: [] });
    useRejectStore.getState().addRejection("speedmaster", ["g1", "g2"], "clinic", "color", "shirt");
    const entries = useRejectStore.getState().entries;
    expect(entries.length).toBe(1);
    expect(entries[0].reason).toBe("color");
    expect(entries[0].slot).toBe("shirt");
    expect(entries[0].watchId).toBe("speedmaster");
  });

  it("getReasonStats aggregates reasons", async () => {
    const { useRejectStore } = await import("../src/stores/rejectStore.js");
    useRejectStore.setState({ entries: [] });
    useRejectStore.getState().addRejection("w1", ["g1"], "sc", "color");
    useRejectStore.getState().addRejection("w2", ["g2"], "sc", "bored");
    useRejectStore.getState().addRejection("w3", ["g3"], "sc", "color");
    const stats = useRejectStore.getState().getReasonStats();
    expect(stats.color).toBe(2);
    expect(stats.bored).toBe(1);
  });

  it("backward compatible — reason defaults to empty string", async () => {
    const { useRejectStore } = await import("../src/stores/rejectStore.js");
    useRejectStore.setState({ entries: [] });
    useRejectStore.getState().addRejection("w1", ["g1"], "sc");
    const entries = useRejectStore.getState().entries;
    expect(entries[0].reason).toBe("");
  });
});
