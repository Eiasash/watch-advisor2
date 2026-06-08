/**
 * Unit tests for src/domain/styleDNA.js — the pure style-pattern derivation
 * functions (colorDNA, formalityDNA, watchAffinityDNA, contextDNA,
 * comfortZoneDNA, buildStyleDNA).
 *
 * Distinct from tests/styleDna.test.js, which exercises the netlify
 * `style-dna.js` HTTP handler. These cover the wrong-output risk in the pure
 * domain layer (over/under-index thresholds, formality bucketing, the
 * wearCount>=2 affinity filter, payload.* fallbacks, and the non-array guards)
 * — the audit-surfaced coverage gap (2026-06-09).
 */
import { describe, it, expect } from "vitest";
import {
  colorDNA,
  formalityDNA,
  watchAffinityDNA,
  contextDNA,
  comfortZoneDNA,
  buildStyleDNA,
} from "../src/domain/styleDNA.js";

// Shared wardrobe: blue=3 (g1,g2,g5), white=1 (g3), black=2 (g4,g6)
const GARMENTS = [
  { id: "g1", color: "Blue", formality: 6 },
  { id: "g2", color: "blue", formality: 8 },
  { id: "g3", color: "White", formality: 4 },
  { id: "g4", color: "black", formality: 2 },
  { id: "g5", color: "Blue", formality: 7 },
  { id: "g6", color: "black", formality: 3 },
];

const WATCHES = [
  { id: "w1", model: "Submariner", brand: "Rolex" },
  { id: "w2", model: "Speedmaster", brand: "Omega" },
];

describe("colorDNA", () => {
  it("counts worn (case-insensitive) and available color frequencies", () => {
    const history = [
      { garmentIds: ["g1", "g3"] }, // blue, white
      { garmentIds: ["g1", "g2"] }, // blue, blue
      { garmentIds: ["g2"] }, // blue
      { payload: { garmentIds: ["g1"] } }, // payload fallback → blue
    ];
    const r = colorDNA(history, GARMENTS);
    expect(r.worn).toEqual({ blue: 5, white: 1 });
    expect(r.available).toEqual({ blue: 3, white: 1, black: 2 });
  });

  it("flags over-indexed colors (index > 1.3) and under-indexed (index < 0.7, availCount >= 2)", () => {
    const history = [
      { garmentIds: ["g1", "g3"] },
      { garmentIds: ["g1", "g2"] },
      { garmentIds: ["g2"] },
      { garmentIds: ["g1"] },
    ];
    const r = colorDNA(history, GARMENTS);
    // blue worn-heavy → over-indexed; black never worn but availCount 2 → under-indexed
    expect(r.overIndex.map((c) => c.color)).toContain("blue");
    expect(r.overIndex[0].index).toBeGreaterThan(1.3);
    expect(r.underIndex.map((c) => c.color)).toContain("black");
    // white never qualifies as under-indexed: availCount 1 < 2
    expect(r.underIndex.map((c) => c.color)).not.toContain("white");
  });

  it("ignores garment ids not present in the wardrobe", () => {
    const r = colorDNA([{ garmentIds: ["ghost", "g3"] }], GARMENTS);
    expect(r.worn).toEqual({ white: 1 });
  });

  it("returns an empty shape for non-array history", () => {
    expect(colorDNA(null, GARMENTS)).toEqual({
      worn: {},
      available: {},
      overIndex: [],
      underIndex: [],
    });
  });
});

describe("formalityDNA", () => {
  it("buckets each outfit by its mean garment formality and reports average + mode", () => {
    const history = [
      { garmentIds: ["g1", "g3"] }, // mean 5 → "4-5"
      { garmentIds: ["g1", "g2"] }, // mean 7 → "6-7"
      { garmentIds: ["g2"] }, // 8 → "8-10"
      { garmentIds: ["g1"] }, // 6 → "6-7"
    ];
    const r = formalityDNA(history, GARMENTS);
    expect(r.distribution).toEqual({ "1-3": 0, "4-5": 1, "6-7": 2, "8-10": 1 });
    expect(r.average).toBe(6.5);
    expect(r.mode).toBe("6-7");
  });

  it("skips entries whose garments carry no formality value", () => {
    const r = formalityDNA([{ garmentIds: ["ghost"] }], GARMENTS);
    expect(r.average).toBe(0);
    expect(Object.values(r.distribution).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("returns the default shape for non-array history", () => {
    const r = formalityDNA(undefined, GARMENTS);
    expect(r).toEqual({
      distribution: { "1-3": 0, "4-5": 0, "6-7": 0, "8-10": 0 },
      average: 0,
      mode: "4-5",
    });
  });
});

describe("watchAffinityDNA", () => {
  it("groups by watch, resolves model/brand, ranks top colors, and averages formality", () => {
    const history = [
      { garmentIds: ["g1", "g3"], watchId: "w1" }, // blue, white
      { garmentIds: ["g1", "g2"], watchId: "w1" }, // blue, blue
      { garmentIds: ["g2"], watchId: "w2" }, // blue
      { payload: { garmentIds: ["g1"] }, watch_id: "w2" }, // watch_id + payload fallbacks
    ];
    const r = watchAffinityDNA(history, GARMENTS, WATCHES);
    expect(r).toHaveLength(2);
    const w1 = r.find((a) => a.watchId === "w1");
    expect(w1.model).toBe("Submariner");
    expect(w1.brand).toBe("Rolex");
    expect(w1.wearCount).toBe(2);
    expect(w1.topColors[0]).toEqual({ color: "blue", count: 3 });
    expect(w1.avgFormality).toBe(6); // (6+4+6+8)/4
    const w2 = r.find((a) => a.watchId === "w2");
    expect(w2.avgFormality).toBe(7); // (8+6)/2
  });

  it("drops watches worn fewer than twice", () => {
    const history = [
      { garmentIds: ["g1"], watchId: "w1" },
      { garmentIds: ["g2"], watchId: "w1" },
      { garmentIds: ["g3"], watchId: "w2" }, // only once → excluded
    ];
    const r = watchAffinityDNA(history, GARMENTS, WATCHES);
    expect(r.map((a) => a.watchId)).toEqual(["w1"]);
  });

  it("falls back to the watch id when the watch is unknown, and returns [] for non-array history", () => {
    const r = watchAffinityDNA(
      [
        { garmentIds: ["g1"], watchId: "wX" },
        { garmentIds: ["g2"], watchId: "wX" },
      ],
      GARMENTS,
      WATCHES,
    );
    expect(r[0].model).toBe("wX");
    expect(watchAffinityDNA(null, GARMENTS, WATCHES)).toEqual([]);
  });
});

describe("contextDNA", () => {
  it("tallies contexts (with payload fallback + unset default) and reports the top one", () => {
    const r = contextDNA([
      { context: "clinic" },
      { context: "clinic" },
      { payload: { context: "casual" } },
      {}, // unset
    ]);
    expect(r.distribution).toEqual({ clinic: 2, casual: 1, unset: 1 });
    expect(r.topContext).toBe("clinic");
    expect(r.total).toBe(4);
  });

  it("returns the default shape for non-array history", () => {
    expect(contextDNA(null)).toEqual({ distribution: {}, topContext: "unset", total: 0 });
  });
});

describe("comfortZoneDNA", () => {
  it("identifies staples (>=3 wears), ignored (0 wears), and the comfort percentage", () => {
    const history = [
      { garmentIds: ["g1"] },
      { garmentIds: ["g1"] },
      { garmentIds: ["g1"] }, // g1 worn 3x → staple
      { garmentIds: ["g2"] }, // g2 worn 1x
    ];
    const r = comfortZoneDNA(history, GARMENTS);
    expect(r.staples.map((g) => g.id)).toEqual(["g1"]);
    expect(r.ignored.map((g) => g.id)).toEqual(expect.arrayContaining(["g3", "g4", "g5", "g6"]));
    expect(r.ignored.map((g) => g.id)).not.toContain("g1");
    expect(r.comfortPct).toBe(75); // 3 staple-wears of 4 total
  });

  it("returns the empty shape for non-array history", () => {
    expect(comfortZoneDNA(undefined, GARMENTS)).toEqual({ staples: [], ignored: [], comfortPct: 0 });
  });
});

describe("buildStyleDNA", () => {
  it("combines all analyses and reports entry/garment counts", () => {
    const history = [
      { garmentIds: ["g1", "g3"], watchId: "w1", context: "clinic" },
      { garmentIds: ["g1", "g2"], watchId: "w1", context: "clinic" },
    ];
    const r = buildStyleDNA(history, GARMENTS, WATCHES);
    expect(r.entryCount).toBe(2);
    expect(r.garmentCount).toBe(GARMENTS.length);
    expect(r.color.worn.blue).toBe(3);
    expect(r.context.topContext).toBe("clinic");
    expect(r.formality.distribution["4-5"]).toBe(1);
  });

  it("coerces non-array history to empty without throwing", () => {
    const r = buildStyleDNA(null, GARMENTS, WATCHES);
    expect(r.entryCount).toBe(0);
    expect(r.garmentCount).toBe(GARMENTS.length);
    expect(r.watchAffinity).toEqual([]);
    expect(r.context.total).toBe(0);
  });
});
