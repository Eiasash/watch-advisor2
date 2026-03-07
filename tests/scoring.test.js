import { describe, it, expect } from "vitest";
import {
  colorMatchScore,
  formalityMatchScore,
  watchCompatibilityScore,
  weatherLayerScore,
  strapShoeScore,
  scoreGarment,
} from "../src/outfitEngine/scoring.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");

// ─── strapShoeScore — leather strap enforcement ─────────────────────────────

describe("strapShoeScore — black leather strap", () => {
  const watch = { strap: "black leather" };

  it("black shoes → 1.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(1.0);
  });
  it("brown shoes → 0.0 (hard constraint)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "brown" })).toBe(0.0);
  });
  it("tan shoes → 0.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "tan" })).toBe(0.0);
  });
  it("white shoes → 0.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "white" })).toBe(0.0);
  });
});

describe("strapShoeScore — brown leather strap", () => {
  const watch = { strap: "brown leather" };

  it("brown shoes → 1.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "brown" })).toBe(1.0);
  });
  it("tan shoes → 1.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "tan" })).toBe(1.0);
  });
  it("cognac shoes → 1.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "cognac" })).toBe(1.0);
  });
  it("black shoes → 0.0 (hard constraint)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(0.0);
  });
  it("white shoes → 0.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "white" })).toBe(0.0);
  });
});

describe("strapShoeScore — alligator strap (brown variant)", () => {
  const watch = { strap: "alligator" };

  it("brown shoes → 1.0 (alligator implies brown)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "brown" })).toBe(1.0);
  });
  it("tan shoes → 1.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "tan" })).toBe(1.0);
  });
  it("black shoes → 0.0", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(0.0);
  });
});

describe("strapShoeScore — bracelet / integrated", () => {
  it("bracelet → any shoe color → 1.0", () => {
    const watch = { strap: "bracelet" };
    expect(strapShoeScore(watch, { type: "shoes", color: "brown" })).toBe(1.0);
    expect(strapShoeScore(watch, { type: "shoes", color: "white" })).toBe(1.0);
    expect(strapShoeScore(watch, { type: "shoes", color: "red" })).toBe(1.0);
  });
  it("integrated → any shoe color → 1.0", () => {
    const watch = { strap: "integrated" };
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(1.0);
  });
  it("empty strap → 1.0", () => {
    expect(strapShoeScore({ strap: "" }, { type: "shoes", color: "red" })).toBe(1.0);
  });
});

describe("strapShoeScore — NATO / canvas / rubber", () => {
  it("nato + white shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "nato black" }, { type: "shoes", color: "white" })).toBe(1.0);
  });
  it("nato + grey shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "nato" }, { type: "shoes", color: "grey" })).toBe(1.0);
  });
  it("nato + tan shoes → 1.0", () => {
    expect(strapShoeScore({ strap: "nato" }, { type: "shoes", color: "tan" })).toBe(1.0);
  });
  it("nato + red shoes → 0.8 (soft preference)", () => {
    expect(strapShoeScore({ strap: "nato" }, { type: "shoes", color: "red" })).toBe(0.8);
  });
  it("rubber → soft preference", () => {
    expect(strapShoeScore({ strap: "rubber" }, { type: "shoes", color: "white" })).toBe(1.0);
    expect(strapShoeScore({ strap: "rubber" }, { type: "shoes", color: "red" })).toBe(0.8);
  });
});

describe("strapShoeScore — non-shoe garments are ignored", () => {
  it("shirt always returns 1.0", () => {
    expect(strapShoeScore({ strap: "black leather" }, { type: "shirt", color: "brown" })).toBe(1.0);
  });
  it("pants always returns 1.0", () => {
    expect(strapShoeScore({ strap: "black leather" }, { type: "pants", color: "brown" })).toBe(1.0);
  });
});

// ─── colorMatchScore ──────────────────────────────────────────────────────────

describe("colorMatchScore", () => {
  it("silver-white dial + navy garment → 1.0", () => {
    expect(colorMatchScore({ dial: "silver-white" }, { color: "navy" })).toBe(1.0);
  });
  it("silver-white dial + red garment → 0.3 (not in palette)", () => {
    expect(colorMatchScore({ dial: "silver-white" }, { color: "red" })).toBe(0.3);
  });
  it("green dial + olive garment → 1.0", () => {
    expect(colorMatchScore({ dial: "green" }, { color: "olive" })).toBe(1.0);
  });
  it("unknown dial → 0.3 (fallback)", () => {
    expect(colorMatchScore({ dial: "rainbow" }, { color: "black" })).toBe(0.3);
  });
  it("null garment color → 0.3", () => {
    expect(colorMatchScore({ dial: "black" }, { color: null })).toBe(0.3);
  });
});

// ─── formalityMatchScore ──────────────────────────────────────────────────────

describe("formalityMatchScore", () => {
  it("exact formality match → 1.0", () => {
    expect(formalityMatchScore({ formality: 7 }, { formality: 7 })).toBe(1.0);
  });
  it("one step off → 0.8", () => {
    expect(formalityMatchScore({ formality: 7 }, { formality: 8 })).toBe(0.8);
  });
  it("max mismatch (diff=5) → 0.0", () => {
    expect(formalityMatchScore({ formality: 10 }, { formality: 5 })).toBe(0.0);
  });
  it("defaults to 5 when undefined", () => {
    expect(formalityMatchScore({}, {})).toBe(1.0);
  });
});

// ─── watchCompatibilityScore ──────────────────────────────────────────────────

describe("watchCompatibilityScore", () => {
  it("dress watch + high-formality garment → high score", () => {
    expect(watchCompatibilityScore({ style: "dress" }, { formality: 8 })).toBe(1.0);
  });
  it("diver watch + casual garment → high score", () => {
    expect(watchCompatibilityScore({ style: "diver" }, { formality: 4 })).toBe(1.0);
  });
  it("dress watch + very casual garment → low score", () => {
    expect(watchCompatibilityScore({ style: "dress" }, { formality: 3 })).toBe(0.0);
  });
});

// ─── weatherLayerScore ────────────────────────────────────────────────────────

describe("weatherLayerScore", () => {
  it("jacket in cold (5°C) → 1.0", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 5 })).toBe(1.0);
  });
  it("jacket in cool (12°C) → 0.8", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 12 })).toBe(0.8);
  });
  it("jacket in mild (18°C) → 0.5", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 18 })).toBe(0.5);
  });
  it("jacket in hot (30°C) → 0.1", () => {
    expect(weatherLayerScore({ type: "jacket" }, { tempC: 30 })).toBe(0.1);
  });
  it("shirt in any temp → 0.5 (neutral)", () => {
    expect(weatherLayerScore({ type: "shirt" }, { tempC: 5 })).toBe(0.5);
  });
  it("no weather data → 0.5", () => {
    expect(weatherLayerScore({ type: "jacket" }, {})).toBe(0.5);
  });
  it("sweater in cold → 1.0", () => {
    expect(weatherLayerScore({ type: "sweater" }, { tempC: 5 })).toBe(1.0);
  });
});

// ─── scoreGarment — composite scoring ─────────────────────────────────────────

describe("scoreGarment — composite", () => {
  it("returns positive score for compatible garment", () => {
    const watch = { dial: "silver-white", formality: 7, style: "sport-elegant", strap: "bracelet" };
    const garment = { type: "shirt", color: "navy", formality: 7 };
    const score = scoreGarment(watch, garment, { tempC: 20 });
    expect(score).toBeGreaterThan(0);
  });

  it("strap-shoe mismatch zeroes shoe score", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "black leather" };
    const brownShoes = { type: "shoes", color: "brown", formality: 7 };
    expect(scoreGarment(watch, brownShoes)).toBe(0);
  });

  it("strap-shoe match preserves shoe score", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "black leather" };
    const blackShoes = { type: "shoes", color: "black", formality: 7 };
    expect(scoreGarment(watch, blackShoes)).toBeGreaterThan(0);
  });

  it("non-shoe garments ignore strap-shoe multiplier", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "black leather" };
    const brownShirt = { type: "shirt", color: "brown", formality: 7 };
    expect(scoreGarment(watch, brownShirt)).toBeGreaterThan(0);
  });
});
