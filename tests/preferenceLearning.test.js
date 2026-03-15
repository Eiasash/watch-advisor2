import { describe, it, expect } from "vitest";
import { learnPreferenceWeights } from "../src/domain/preferenceLearning.js";

describe("learnPreferenceWeights", () => {
  it("returns default weights for empty history", () => {
    const w = learnPreferenceWeights([]);
    expect(w.formality).toBe(1);
    expect(w.color).toBe(1);
    expect(w.watchMatch).toBe(1);
  });

  it("returns default weights for null/undefined history", () => {
    expect(learnPreferenceWeights(null).formality).toBe(1);
    expect(learnPreferenceWeights(undefined).formality).toBe(1);
  });

  it("returns default weights when history has no formal/casual entries", () => {
    const w = learnPreferenceWeights([{ context: "riviera" }, { context: "riviera" }]);
    // riviera is casual → formality leans low
    expect(w.formality).toBeLessThanOrEqual(1);
  });

  it("formal-heavy history produces formality weight > 1", () => {
    const history = Array.from({ length: 8 }, () => ({ context: "formal" }));
    const w = learnPreferenceWeights(history);
    expect(w.formality).toBeGreaterThan(1);
  });

  it("casual-heavy history produces formality weight < 1", () => {
    const history = Array.from({ length: 8 }, () => ({ context: "casual" }));
    const w = learnPreferenceWeights(history);
    expect(w.formality).toBeLessThan(1);
  });

  it("clinic context counts as formal", () => {
    const history = Array.from({ length: 6 }, () => ({ context: "clinic" }));
    const w = learnPreferenceWeights(history);
    expect(w.formality).toBeGreaterThan(1);
  });

  it("output formality weight stays within [0.85, 1.30]", () => {
    const allFormal  = Array.from({ length: 50 }, () => ({ context: "formal" }));
    const allCasual  = Array.from({ length: 50 }, () => ({ context: "casual" }));
    const mixed      = [...allFormal, ...allCasual];

    expect(learnPreferenceWeights(allFormal).formality).toBeLessThanOrEqual(1.30);
    expect(learnPreferenceWeights(allFormal).formality).toBeGreaterThanOrEqual(0.85);
    expect(learnPreferenceWeights(allCasual).formality).toBeLessThanOrEqual(1.30);
    expect(learnPreferenceWeights(allCasual).formality).toBeGreaterThanOrEqual(0.85);
    expect(learnPreferenceWeights(mixed).formality).toBeLessThanOrEqual(1.30);
    expect(learnPreferenceWeights(mixed).formality).toBeGreaterThanOrEqual(0.85);
  });

  it("50/50 formal/casual produces weight near 1.075 (midpoint of range)", () => {
    const history = [
      ...Array.from({ length: 5 }, () => ({ context: "formal" })),
      ...Array.from({ length: 5 }, () => ({ context: "casual" })),
    ];
    const w = learnPreferenceWeights(history);
    expect(w.formality).toBeCloseTo(1.075, 2);
  });

  it("supports entry.formality field as well as entry.context", () => {
    const history = Array.from({ length: 4 }, () => ({ formality: "formal" }));
    const w = learnPreferenceWeights(history);
    expect(w.formality).toBeGreaterThan(1);
  });
});
