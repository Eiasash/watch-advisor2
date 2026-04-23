import { describe, it, expect } from "vitest";
import {
  colorMatchScore,
  formalityMatchScore,
  watchCompatibilityScore,
  weatherLayerScore,
  strapShoeScore,
  scoreGarment,
  contextFormalityScore,
  filterShoesByStrap,
  pantsShoeHarmony,
  pickBelt,
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
  it("brown shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "brown" })).toBe(1.0);
  });
  it("tan shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "tan" })).toBe(1.0);
  });
  it("white shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "white" })).toBe(1.0);
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
  it("black shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(1.0);
  });
  it("white shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "white" })).toBe(1.0);
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
  it("black shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore(watch, { type: "shoes", color: "black" })).toBe(1.0);
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
  it("nato + red shoes → 1.0 (rule disabled)", () => {
    expect(strapShoeScore({ strap: "nato" }, { type: "shoes", color: "red" })).toBe(1.0);
  });
  it("rubber → 1.0 (rule disabled)", () => {
    expect(strapShoeScore({ strap: "rubber" }, { type: "shoes", color: "white" })).toBe(1.0);
    expect(strapShoeScore({ strap: "rubber" }, { type: "shoes", color: "red" })).toBe(1.0);
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

  it("strap-shoe mismatch: shoe still scores > 0 (rule disabled)", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "black leather" };
    const brownShoes = { type: "shoes", color: "brown", formality: 7 };
    expect(scoreGarment(watch, brownShoes)).toBeGreaterThan(0);
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

  it("outfitFormality overrides watch formality for garment scoring", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "bracelet" };
    // outfitFormality 7, garment formality 7 → perfect fm → high score
    const shirt = { type: "shirt", color: "black", formality: 7 };
    const score = scoreGarment(watch, shirt, {}, 7, null);
    expect(score).toBeGreaterThan(0);
  });

  it("outfitFormality hard gate: non-shoe with diff≥5 returns -Infinity", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "bracelet" };
    // outfitFormality 7, garment formality 2 → diff = 5 → fm = 0 → -Infinity
    const casualShirt = { type: "shirt", color: "black", formality: 2 };
    const score = scoreGarment(watch, casualShirt, {}, 7, null);
    expect(score).toBe(-Infinity);
  });

  it("shoes are exempt from the formality hard gate", () => {
    const watch = { dial: "black", formality: 7, style: "dress", strap: "bracelet" };
    // formality diff = 5 but shoes are exempt
    const sneakers = { type: "shoes", color: "black", formality: 2 };
    const score = scoreGarment(watch, sneakers, {}, 7, null);
    expect(score).toBeGreaterThan(0);
  });

  it("scoreGarment returns positive score for layer garment in hot weather (not -Infinity)", () => {
    const watch = { dial: "black", formality: 5, style: "sport-elegant", strap: "bracelet" };
    const jacket = { type: "jacket", color: "black", formality: 5 };
    // weatherLayerScore for jacket at 30°C returns 0.1 (not 0), so the gate is not triggered
    const score = scoreGarment(watch, jacket, { tempC: 30 });
    expect(score).toBeGreaterThan(0); // 0.1 from weather, so positive
  });
});

// ─── colorMatchScore — near-miss (0.85) ──────────────────────────────────────

describe("colorMatchScore — near-miss 0.85", () => {
  it("graphite matches silver-white dial via black family near-miss", () => {
    // "graphite" is not in DIAL_COLOR_MAP["silver-white"] but is in the black family
    // "charcoal" IS in silver-white and also in black family → near-miss → 0.85
    expect(colorMatchScore({ dial: "silver-white" }, { color: "graphite" })).toBe(0.85);
  });

  it("charcoal matches silver-white dial exactly → 1.0", () => {
    expect(colorMatchScore({ dial: "silver-white" }, { color: "charcoal" })).toBe(1.0);
  });

  it("near-miss does not apply when no family match exists", () => {
    // "red" has a family ("warm") but silver-white has no warm-family colors in its palette
    expect(colorMatchScore({ dial: "silver-white" }, { color: "red" })).toBe(0.3);
  });
});

// ─── contextFormalityScore ────────────────────────────────────────────────────

describe("contextFormalityScore", () => {
  it("returns 0.75 (neutral) when no context is set", () => {
    expect(contextFormalityScore({ formality: 5 }, null)).toBe(0.75);
    expect(contextFormalityScore({ formality: 5 }, undefined)).toBe(0.75);
    expect(contextFormalityScore({ formality: 5 }, "unknown-context")).toBe(0.75);
  });

  it("formal context: garment at target formality → 1.0", () => {
    // "formal" target=8, min=6; garment formality=8 → diff=0 → 1.0
    expect(contextFormalityScore({ formality: 8 }, "formal")).toBe(1.0);
  });

  it("formal context: garment below minimum → 0.1", () => {
    // "formal" min=6; garment formality=4 → below min → 0.1
    expect(contextFormalityScore({ formality: 4 }, "formal")).toBe(0.1);
  });

  it("formal context: garment at minimum → partial score", () => {
    // "formal" min=6, target=8; garment formality=6 → diff=|8-6|/5=0.4 → 0.6
    expect(contextFormalityScore({ formality: 6 }, "formal")).toBeCloseTo(0.6, 2);
  });

  it("casual context: low-formality garment scores well", () => {
    // "casual" target=4, min=1; garment formality=4 → diff=0 → 1.0
    expect(contextFormalityScore({ formality: 4 }, "casual")).toBe(1.0);
  });

  it("hospital-smart-casual context: above minimum → partial score", () => {
    // min=5, target=7; garment formality=7 → diff=0 → 1.0
    expect(contextFormalityScore({ formality: 7 }, "hospital-smart-casual")).toBe(1.0);
  });
});

// ─── filterShoesByStrap ───────────────────────────────────────────────────────

describe("filterShoesByStrap", () => {
  const watch = { strap: "black leather" };
  const shoes = [
    { type: "shoes", color: "black", formality: 7 },
    { type: "shoes", color: "brown", formality: 6 },
    { type: "shoes", color: "white", formality: 4 },
  ];

  it("returns all shoes (strapShoeScore always 1.0 — rule disabled)", () => {
    const result = filterShoesByStrap(watch, shoes, "casual");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when input is empty", () => {
    expect(filterShoesByStrap(watch, [], "casual")).toEqual([]);
  });

  it("returns empty array when input is null", () => {
    expect(filterShoesByStrap(watch, null, "casual")).toEqual([]);
  });

  it("returns the same shoes array when all pass (no filtering needed)", () => {
    const result = filterShoesByStrap(watch, shoes, null);
    expect(result).toEqual(shoes);
  });
});

// ─── pantsShoeHarmony ─────────────────────────────────────────────────────────

describe("pantsShoeHarmony", () => {
  it("returns 0.7 when pants or shoes is null", () => {
    expect(pantsShoeHarmony(null, { color: "black" })).toBe(0.7);
    expect(pantsShoeHarmony({ color: "navy" }, null)).toBe(0.7);
    expect(pantsShoeHarmony(null, null)).toBe(0.7);
  });

  it("white shoes → 0.9 regardless of pants", () => {
    expect(pantsShoeHarmony({ color: "navy" }, { color: "white" })).toBe(0.9);
  });

  it("white pants → 0.9 regardless of shoes", () => {
    expect(pantsShoeHarmony({ color: "white" }, { color: "black" })).toBe(0.9);
  });

  it("same tone (both cool) → 1.0", () => {
    // navy (cool) + black (cool) → 1.0
    expect(pantsShoeHarmony({ color: "navy" }, { color: "black" })).toBe(1.0);
  });

  it("same tone (both warm) → 1.0", () => {
    // brown (warm) + tan (warm) → 1.0
    expect(pantsShoeHarmony({ color: "brown" }, { color: "tan" })).toBe(1.0);
  });

  it("neutral tone (one side) → 0.8", () => {
    // unknown color has no tone → neutral → 0.8
    expect(pantsShoeHarmony({ color: "unknown-color" }, { color: "black" })).toBe(0.8);
  });

  it("warm pants + cool shoes → 0.3 (clash)", () => {
    // brown (warm) + navy (cool) → 0.3
    expect(pantsShoeHarmony({ color: "brown" }, { color: "navy" })).toBe(0.3);
  });

  it("cool pants + warm shoes → 0.5 (mismatch but tolerable)", () => {
    // navy (cool) + brown (warm) → 0.5
    expect(pantsShoeHarmony({ color: "navy" }, { color: "brown" })).toBe(0.5);
  });
});

// ─── pickBelt ─────────────────────────────────────────────────────────────────

describe("pickBelt", () => {
  it("returns null when no shoes provided", () => {
    expect(pickBelt(null, [{ color: "black" }])).toBeNull();
  });

  it("returns null when belts array is empty", () => {
    expect(pickBelt({ color: "black" }, [])).toBeNull();
    expect(pickBelt({ color: "black" }, null)).toBeNull();
  });

  it("white shoes → returns first belt", () => {
    const belts = [{ color: "tan" }, { color: "black" }];
    expect(pickBelt({ color: "white" }, belts)).toBe(belts[0]);
  });

  it("exact color match → returns matched belt", () => {
    const belts = [{ color: "black" }, { color: "brown" }];
    expect(pickBelt({ color: "black" }, belts)).toBe(belts[0]);
  });

  it("brown family match (exact root) → 0.95 scored", () => {
    // shoe: "dark brown", belt: "brown" — both have "brown" root → 0.95
    const belts = [{ color: "black" }, { color: "brown" }];
    const result = pickBelt({ color: "dark brown" }, belts);
    expect(result).toBe(belts[1]); // brown belt scores 0.95, black scores 0.1
  });

  it("brown family match (no shared root) → 0.85 scored", () => {
    // shoe: "cognac", belt: "tan" — both brownFamily but no shared "brown" root → 0.85
    const belts = [{ color: "blue" }, { color: "tan" }];
    const result = pickBelt({ color: "cognac" }, belts);
    expect(result).toBe(belts[1]); // tan scores 0.85, blue scores 0.1
  });

  it("no good match → falls back to first belt", () => {
    // shoe: "pink", all belts: "black", "navy" → all score 0.1 → return first belt
    const belts = [{ color: "black" }, { color: "navy" }];
    const result = pickBelt({ color: "pink" }, belts);
    expect(result).toBe(belts[0]);
  });
});
