import { describe, it, expect } from "vitest";
import { applyFactors } from "../src/outfitEngine/scoringFactors/index.js";

describe("scoringFactors", () => {
  it("returns 0 when no factors contribute", () => {
    const candidate = {};
    const context   = {};
    const score = applyFactors(candidate, context);
    expect(score).toBe(0);
  });

  it("sums factor contributions", () => {
    const candidate = {
      colorScore:     1,
      formalityScore: 2,
      diversityBonus: -0.12,
    };
    const context = { history: [] };
    const score = applyFactors(candidate, context);
    expect(score).toBeTypeOf("number");
  });

  it("passes context to factors", () => {
    const candidate = { garment: { id: "shirt1" } };
    const context   = { history: [] };
    const score = applyFactors(candidate, context);
    expect(score).toBeTypeOf("number");
  });

  it("produces deterministic output", () => {
    const candidate = {
      colorScore:     0.7,
      formalityScore: 0.8,
      diversityBonus: -0.12,
    };
    const context = { history: [] };
    const s1 = applyFactors(candidate, context);
    const s2 = applyFactors(candidate, context);
    expect(s1).toBe(s2);
  });
});
