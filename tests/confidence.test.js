import { describe, it, expect } from "vitest";
import { outfitConfidence } from "../src/outfitEngine/confidence.js";

describe("outfitConfidence", () => {
  it("returns weak for score=0", () => {
    const { confidence, confidenceLabel } = outfitConfidence(0);
    expect(confidence).toBe(0);
    expect(confidenceLabel).toBe("weak");
  });

  it("returns weak for -Infinity", () => {
    const r = outfitConfidence(-Infinity);
    expect(r.confidenceLabel).toBe("weak");
    expect(r.confidence).toBe(0);
  });

  // Additive engine: 3 garments × ~8 each = ~24 → 24/30 = 0.80 → "strong"
  it("returns strong for high additive combo score", () => {
    const { confidenceLabel } = outfitConfidence(24);
    expect(confidenceLabel).toBe("strong");
  });

  // 3 garments × ~5.5 each = ~16.5 → 16.5/30 = 0.55 → "good"
  it("returns good for mid-range additive combo score", () => {
    const { confidenceLabel } = outfitConfidence(16.5);
    expect(confidenceLabel).toBe("good");
  });

  // 3 garments × ~3.5 each = ~10.5 → 10.5/30 = 0.35 → "moderate"
  it("returns moderate for low additive combo score", () => {
    const { confidenceLabel } = outfitConfidence(10.5);
    expect(confidenceLabel).toBe("moderate");
  });

  it("returns weak for very low score", () => {
    const { confidenceLabel } = outfitConfidence(5);
    expect(confidenceLabel).toBe("weak");
  });

  it("confidence is capped at 1.0 for score above ceiling", () => {
    const { confidence } = outfitConfidence(35);
    expect(confidence).toBe(1);
  });

  it("confidence is a number in [0,1]", () => {
    [0, 3, 10, 16, 24, 30].forEach(s => {
      const { confidence } = outfitConfidence(s);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });
});
