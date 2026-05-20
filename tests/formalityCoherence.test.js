import { describe, it, expect } from "vitest";
import {
  formalitySpreadMultiplier,
  _pairHarmonyScore,
} from "../src/outfitEngine/outfitBuilder.js";

const g = (formality, color = "navy") => ({
  formality,
  color,
  name: `${color} f${formality}`,
});

// ── formalitySpreadMultiplier ─────────────────────────────────────────────────

describe("formalitySpreadMultiplier", () => {
  it("returns 1 for a tight formality range (spread ≤ 3)", () => {
    expect(formalitySpreadMultiplier([g(4), g(5), g(6)])).toBe(1);
  });

  it("returns 1 for a head-to-toe casual outfit — never flags casual itself", () => {
    // spread 1 — the engine penalises inconsistency, not low formality
    expect(formalitySpreadMultiplier([g(3), g(4), g(3)])).toBe(1);
  });

  it("returns 1 for a head-to-toe formal outfit", () => {
    expect(formalitySpreadMultiplier([g(7), g(8), g(8)])).toBe(1);
  });

  it("penalises dress trouser (7) + sneaker (3) — spread 4 → 0.85", () => {
    expect(formalitySpreadMultiplier([g(4), g(7), g(3)])).toBeCloseTo(0.85, 5);
  });

  it("penalises spread 5 → 0.70", () => {
    expect(formalitySpreadMultiplier([g(8), g(3)])).toBeCloseTo(0.7, 5);
  });

  it("floors at 0.55 for an extreme spread", () => {
    expect(formalitySpreadMultiplier([g(10), g(1)])).toBe(0.55);
  });

  it("returns 1 with fewer than 2 garments", () => {
    expect(formalitySpreadMultiplier([g(5)])).toBe(1);
    expect(formalitySpreadMultiplier([])).toBe(1);
    expect(formalitySpreadMultiplier(null)).toBe(1);
  });

  it("ignores null slot entries", () => {
    expect(formalitySpreadMultiplier([g(4), null, g(7), null])).toBeCloseTo(1, 5);
  });

  it("defaults missing formality to 5", () => {
    // {color} alone has no formality → treated as 5 → spread 0 vs f5
    expect(formalitySpreadMultiplier([{ color: "navy" }, g(5)])).toBe(1);
  });
});

// ── _pairHarmonyScore integration ─────────────────────────────────────────────

describe("_pairHarmonyScore — formality coherence", () => {
  it("a dress-trouser + sneaker combo scores below the same outfit with a derby", () => {
    // identical colors across both combos → color terms cancel out;
    // only the shoe formality differs, isolating the coherence effect.
    const shirt = g(4, "white");
    const dressPants = g(7, "stone");
    const derby = g(6, "brown"); // spread 7-4 = 3 → ×1.00
    const sneaker = g(3, "brown"); // spread 7-3 = 4 → ×0.85

    const withDerby = _pairHarmonyScore(shirt, dressPants, derby);
    const withSneaker = _pairHarmonyScore(shirt, dressPants, sneaker);

    expect(withSneaker).toBeLessThan(withDerby);
    expect(withSneaker).toBeCloseTo(withDerby * 0.85, 5);
  });

  it("leaves a coherent casual trio at full harmony", () => {
    // navy pants + black shoes share the cool tone → pantsShoeHarmony 1.0;
    // no color repeats; formality spread 1 → no penalty.
    const score = _pairHarmonyScore(g(3, "white"), g(4, "navy"), g(3, "black"));
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("garments without formality (default 5) incur no coherence penalty", () => {
    const score = _pairHarmonyScore(
      { color: "white", name: "w" },
      { color: "navy", name: "n" },
      { color: "black", name: "b" },
    );
    expect(score).toBeCloseTo(1.0, 5);
  });
});
