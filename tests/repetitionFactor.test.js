import { describe, it, expect, vi } from "vitest";

// Mock contextMemory to control repetitionPenalty output
vi.mock("../src/domain/contextMemory.js", () => ({
  repetitionPenalty: vi.fn(() => -0.28),
}));

import repetitionFactor from "../src/outfitEngine/scoringFactors/repetitionFactor.js";
import { repetitionPenalty } from "../src/domain/contextMemory.js";

describe("repetitionFactor", () => {
  // ── Compounding prevention ────────────────────────────────────────────────

  it("returns 0 when diversityBonus is already negative (avoid compounding)", () => {
    const candidate = { garment: { id: "g1" }, diversityBonus: -0.12 };
    const context = { history: [] };
    expect(repetitionFactor(candidate, context)).toBe(0);
  });

  it("returns repetitionPenalty when diversityBonus is 0 (no diversity penalty)", () => {
    const candidate = { garment: { id: "g1" }, diversityBonus: 0 };
    const context = { history: [{ garmentIds: ["g1"] }] };
    expect(repetitionFactor(candidate, context)).toBe(-0.28);
  });

  it("returns repetitionPenalty when diversityBonus is positive", () => {
    const candidate = { garment: { id: "g1" }, diversityBonus: 0.1 };
    const context = { history: [] };
    expect(repetitionFactor(candidate, context)).toBe(-0.28);
  });

  it("returns repetitionPenalty when diversityBonus is undefined", () => {
    const candidate = { garment: { id: "g1" } };
    const context = { history: [] };
    // undefined ?? 0 = 0, which is >= 0, so penalty applies
    expect(repetitionFactor(candidate, context)).toBe(-0.28);
  });

  // ── Guard: no garment id ──────────────────────────────────────────────────

  it("returns 0 when garment has no id", () => {
    expect(repetitionFactor({ garment: {} }, { history: [] })).toBe(0);
  });

  it("returns 0 when garment is null", () => {
    expect(repetitionFactor({ garment: null }, { history: [] })).toBe(0);
  });

  it("returns 0 when garment is undefined", () => {
    expect(repetitionFactor({}, { history: [] })).toBe(0);
  });

  // ── Delegates to contextMemory ────────────────────────────────────────────

  it("passes garment.id and history to repetitionPenalty", () => {
    const history = [{ id: "h1" }];
    repetitionFactor({ garment: { id: "g5" }, diversityBonus: 0 }, { history });
    expect(repetitionPenalty).toHaveBeenCalledWith("g5", history);
  });
});
