import { describe, it, expect } from "vitest";
import diversityFactor from "../src/outfitEngine/scoringFactors/diversityFactor.js";

describe("diversityFactor", () => {
  it("returns diversityBonus when present", () => {
    expect(diversityFactor({ diversityBonus: -0.12 })).toBe(-0.12);
  });

  it("returns 0 when diversityBonus is 0", () => {
    expect(diversityFactor({ diversityBonus: 0 })).toBe(0);
  });

  it("returns 0 when diversityBonus is undefined", () => {
    expect(diversityFactor({})).toBe(0);
  });

  it("returns 0 when diversityBonus is null", () => {
    expect(diversityFactor({ diversityBonus: null })).toBe(0);
  });

  it("returns positive bonus", () => {
    expect(diversityFactor({ diversityBonus: 0.3 })).toBe(0.3);
  });

  it("returns large negative penalty", () => {
    expect(diversityFactor({ diversityBonus: -0.36 })).toBe(-0.36);
  });

  it("ignores other candidate properties", () => {
    expect(diversityFactor({ diversityBonus: 0.1, garment: { id: "g1" }, baseScore: 5 })).toBe(0.1);
  });
});
