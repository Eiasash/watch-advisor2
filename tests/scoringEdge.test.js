import { describe, it, expect } from "vitest";
import {
  colorMatchScore,
  formalityMatchScore,
  watchCompatibilityScore,
  weatherLayerScore,
  strapShoeScore,
  scoreGarment,
} from "../src/outfitEngine/scoring.js";

// ─── strapShoeScore — non-standard leather colors ──────────────────────────

describe("strapShoeScore — colored alligator straps have specific shoe rules", () => {
  it("navy alligator + brown shoes → 1.0 (navy strap now allows brown)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });

  it("navy alligator + tan shoes → 1.0 (navy strap allows tan)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "tan" })).toBe(1.0);
  });

  it("navy alligator + cognac shoes → 1.0 (navy strap allows cognac)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "cognac" })).toBe(1.0);
  });

  it("navy alligator + dark brown shoes → 1.0 (navy strap allows dark brown)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "dark brown" })).toBe(1.0);
  });

  it("navy alligator + black shoes → 1.0 (navy strap + black shoes = correct)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "black" })).toBe(1.0);
  });

  it("navy alligator + white shoes → 1.0 (navy strap + white sneakers = correct)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "white" })).toBe(1.0);
  });

  it("navy alligator + burgundy shoes → 0.0 (navy strap still hard-blocks unrelated colors)", () => {
    expect(strapShoeScore({ strap: "navy alligator" }, { type: "shoes", color: "burgundy" })).toBe(0.0);
  });

  it("grey alligator + tan shoes → 0.3 (grey strap tolerates non-ideal shoes)", () => {
    expect(strapShoeScore({ strap: "grey alligator" }, { type: "shoes", color: "tan" })).toBe(0.3);
  });

  it("grey alligator + black shoes → 1.0 (grey strap + black shoes = preferred)", () => {
    expect(strapShoeScore({ strap: "grey alligator" }, { type: "shoes", color: "black" })).toBe(1.0);
  });

  it("olive leather + black shoes → 1.0 (teal/olive/green strap + black = preferred)", () => {
    expect(strapShoeScore({ strap: "olive leather" }, { type: "shoes", color: "black" })).toBe(1.0);
  });

  it("teal leather + white shoes → 1.0 (teal/olive/green strap + white = preferred)", () => {
    expect(strapShoeScore({ strap: "teal leather" }, { type: "shoes", color: "white" })).toBe(1.0);
  });

  it("teal leather + brown shoes → 0.3 (teal strap tolerates non-ideal shoes)", () => {
    expect(strapShoeScore({ strap: "teal leather" }, { type: "shoes", color: "brown" })).toBe(0.3);
  });
});

// ─── strapShoeScore — navy hybrid strap (navy + rubber, nato, canvas) ────────
// Regression: "Navy leather/rubber" contains "rubber" which previously matched
// CASUAL_STRAP_TERMS first (soft 0.8 fallback) instead of SPECIAL_STRAP_RULES
// (hard 0.0). SPECIAL_STRAP_RULES must take priority over CASUAL_STRAP_TERMS.

describe("strapShoeScore — navy hybrid strap priority", () => {
  it("navy leather/rubber + brown shoes → 1.0 (navy allows brown since Mar 2026)", () => {
    expect(strapShoeScore({ strap: "navy leather/rubber" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });
  it("navy leather/rubber + black shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "navy leather/rubber" }, { type: "shoes", color: "black" })).toBe(1.0);
  });
  it("navy leather/rubber + white shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "navy leather/rubber" }, { type: "shoes", color: "white" })).toBe(1.0);
  });
  it("navy leather/rubber + tan shoes → 1.0 (navy allows tan since Mar 2026)", () => {
    expect(strapShoeScore({ strap: "navy leather/rubber" }, { type: "shoes", color: "tan" })).toBe(1.0);
  });
  it("navy canvas strap + brown shoes → 1.0 (navy allows brown since Mar 2026)", () => {
    expect(strapShoeScore({ strap: "navy canvas" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });
  it("plain rubber strap (no color) + brown shoes → 0.8 (pure rubber = soft path only)", () => {
    expect(strapShoeScore({ strap: "white rubber" }, { type: "shoes", color: "brown" })).toBe(0.8);
  });
});

// ─── strapShoeScore — honey/cognac/caramel leather ──────────────────────────

describe("strapShoeScore — honey/cognac/caramel strap variants", () => {
  it("honey leather + brown shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "honey leather" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });

  it("cognac leather + tan shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "cognac leather" }, { type: "shoes", color: "tan" })).toBe(1.0);
  });

  it("caramel calfskin + dark brown shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "caramel calfskin" }, { type: "shoes", color: "dark brown" })).toBe(1.0);
  });

  it("honey leather + black shoes → 0.0", () => {
    expect(strapShoeScore({ strap: "honey leather" }, { type: "shoes", color: "black" })).toBe(0.0);
  });
});

// ─── strapShoeScore — suede strap ───────────────────────────────────────────

describe("strapShoeScore — suede strap", () => {
  it("black suede + black shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "black suede" }, { type: "shoes", color: "black" })).toBe(1.0);
  });

  it("brown suede + brown shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "brown suede" }, { type: "shoes", color: "brown" })).toBe(1.0);
  });

  it("black suede + brown shoes → 0.0", () => {
    expect(strapShoeScore({ strap: "black suede" }, { type: "shoes", color: "brown" })).toBe(0.0);
  });
});

// ─── colorMatchScore — all dial colors ──────────────────────────────────────

describe("colorMatchScore — extended dials", () => {
  it("teal dial + grey garment → 1.0", () => {
    expect(colorMatchScore({ dial: "teal" }, { color: "grey" })).toBe(1.0);
  });

  it("burgundy dial + navy garment → 1.0", () => {
    expect(colorMatchScore({ dial: "burgundy" }, { color: "navy" })).toBe(1.0);
  });

  it("meteorite dial + brown garment → 1.0", () => {
    expect(colorMatchScore({ dial: "meteorite" }, { color: "brown" })).toBe(1.0);
  });

  it("turquoise dial + cream garment → 1.0", () => {
    expect(colorMatchScore({ dial: "turquoise" }, { color: "cream" })).toBe(1.0);
  });

  it("purple dial + stone garment → 1.0", () => {
    expect(colorMatchScore({ dial: "purple" }, { color: "stone" })).toBe(1.0);
  });

  it("red dial + grey garment → 1.0", () => {
    expect(colorMatchScore({ dial: "red" }, { color: "grey" })).toBe(1.0);
  });

  it("white-teal dial + teal garment → 1.0", () => {
    expect(colorMatchScore({ dial: "white-teal" }, { color: "teal" })).toBe(1.0);
  });

  it("black-red dial + red garment → 1.0", () => {
    expect(colorMatchScore({ dial: "black-red" }, { color: "red" })).toBe(1.0);
  });
});

// ─── formalityMatchScore — boundary values ──────────────────────────────────

describe("formalityMatchScore — boundary values", () => {
  it("diff of 2 → 0.6", () => {
    expect(formalityMatchScore({ formality: 8 }, { formality: 6 })).toBeCloseTo(0.6, 2);
  });

  it("diff of 3 → 0.4", () => {
    expect(formalityMatchScore({ formality: 10 }, { formality: 7 })).toBeCloseTo(0.4, 2);
  });

  it("diff of 4 → 0.2", () => {
    expect(formalityMatchScore({ formality: 9 }, { formality: 5 })).toBeCloseTo(0.2, 2);
  });

  it("diff ≥ 5 → 0.0", () => {
    expect(formalityMatchScore({ formality: 10 }, { formality: 4 })).toBe(0.0);
  });
});

// ─── weatherLayerScore — temperature boundaries ─────────────────────────────

describe("weatherLayerScore — temperature boundaries", () => {
  it("jacket at exactly 10°C → 0.8", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 10 })).toBe(0.8);
  });

  it("jacket at exactly 16°C → 0.5", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 16 })).toBe(0.5);
  });

  it("jacket at exactly 22°C → 0.1", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 22 })).toBe(0.1);
  });

  it("sweater at exactly 10°C → 0.8", () => {
    expect(weatherLayerScore({ type: "sweater" }, { tempC: 10 })).toBe(0.8);
  });

  it("null weather object → 0.5", () => {
    expect(weatherLayerScore({ type: "jacket" }, null)).toBe(0.5);
  });

  it("undefined weather → 0.5", () => {
    expect(weatherLayerScore({ type: "jacket" })).toBe(0.5);
  });
});

// ─── scoreGarment — category type fallback ──────────────────────────────────

describe("scoreGarment — category fallback", () => {
  it("uses category when type is missing", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "bracelet" };
    const garment = { category: "shirt", color: "black", formality: 7 };
    const score = scoreGarment(watch, garment, { tempC: 20 });
    expect(score).toBeGreaterThan(0);
  });

  it("shoes with category field still apply strap-shoe rule", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "black leather" };
    const brownShoes = { category: "shoes", color: "brown", formality: 7 };
    expect(scoreGarment(watch, brownShoes)).toBe(0);
  });
});

// ─── watchCompatibilityScore — all styles ───────────────────────────────────

describe("watchCompatibilityScore — all style targets", () => {
  it("sport-elegant + formality 6 → 1.0", () => {
    expect(watchCompatibilityScore({ style: "sport-elegant" }, { formality: 6 })).toBe(1.0);
  });

  it("pilot + formality 5 → 1.0", () => {
    expect(watchCompatibilityScore({ style: "pilot" }, { formality: 5 })).toBe(1.0);
  });

  it("field + formality 5 → 1.0", () => {
    expect(watchCompatibilityScore({ style: "field" }, { formality: 5 })).toBe(1.0);
  });

  it("unknown style defaults to formality 5", () => {
    expect(watchCompatibilityScore({ style: "unknown" }, { formality: 5 })).toBe(1.0);
  });
});
