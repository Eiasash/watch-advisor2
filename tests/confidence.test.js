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

  it("returns strong for high score near ceiling", () => {
    const { confidenceLabel } = outfitConfidence(0.58);
    expect(confidenceLabel).toBe("strong");
  });

  it("returns good for mid-range score", () => {
    const { confidenceLabel } = outfitConfidence(0.35);
    expect(confidenceLabel).toBe("good");
  });

  it("confidence is capped at 1.0 for score above ceiling", () => {
    const { confidence } = outfitConfidence(10);
    expect(confidence).toBe(1);
  });

  it("confidence is a number in [0,1]", () => {
    [0, 0.1, 0.3, 0.55, 0.6, 1.0].forEach(s => {
      const { confidence } = outfitConfidence(s);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });
});
