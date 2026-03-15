import { describe, it, expect } from "vitest";
import { recommendationConfidence } from "../src/domain/recommendationConfidence.js";

describe("recommendationConfidence", () => {
  it("returns 0 for null scoreParts", () => {
    expect(recommendationConfidence(null)).toBe(0);
  });

  it("returns 0 for undefined scoreParts", () => {
    expect(recommendationConfidence(undefined)).toBe(0);
  });

  it("returns 0 for empty scoreParts object (all dimensions zero)", () => {
    expect(recommendationConfidence({})).toBe(0);
  });

  it("all dimensions at max (1.0) → confidence exactly 1", () => {
    const c = recommendationConfidence({
      colorMatch: 1, formalityMatch: 1, watchCompat: 1, weatherLayer: 1,
    });
    expect(c).toBeCloseTo(1, 5);
  });

  it("high scoreParts → confidence > 0.8", () => {
    const c = recommendationConfidence({
      colorMatch: 0.9, formalityMatch: 0.95, watchCompat: 0.85, weatherLayer: 1.0,
    });
    expect(c).toBeGreaterThan(0.8);
  });

  it("mixed inputs → mid-range confidence", () => {
    const c = recommendationConfidence({
      colorMatch: 0.5, formalityMatch: 0.5, watchCompat: 0.5, weatherLayer: 0.5,
    });
    expect(c).toBeCloseTo(0.5, 5);
  });

  it("missing individual dimensions default to 0", () => {
    const only = recommendationConfidence({ formalityMatch: 1 });
    expect(only).toBeCloseTo(0.35, 5); // 0.35 weight
  });

  it("output is clamped to [0, 1]", () => {
    const over = recommendationConfidence({
      colorMatch: 5, formalityMatch: 5, watchCompat: 5, weatherLayer: 5,
    });
    expect(over).toBeLessThanOrEqual(1);
    expect(over).toBeGreaterThanOrEqual(0);

    const under = recommendationConfidence({
      colorMatch: -5, formalityMatch: -5, watchCompat: -5, weatherLayer: -5,
    });
    expect(under).toBeGreaterThanOrEqual(0);
  });

  it("formalityMatch has highest weight (0.35)", () => {
    const formalOnly = recommendationConfidence({ formalityMatch: 1 });
    const colorOnly  = recommendationConfidence({ colorMatch: 1 });
    expect(formalOnly).toBeGreaterThan(colorOnly);
  });
});
