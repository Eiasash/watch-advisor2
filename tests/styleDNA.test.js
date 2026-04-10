import { describe, it, expect } from "vitest";
import { colorDNA, formalityDNA, watchAffinityDNA, contextDNA, comfortZoneDNA, buildStyleDNA } from "../src/domain/styleDNA.js";

const garments = [
  { id: "g1", color: "Navy", formality: 5 },
  { id: "g2", color: "Navy", formality: 6 },
  { id: "g3", color: "Black", formality: 7 },
  { id: "g4", color: "White", formality: 3 },
  { id: "g5", color: "Brown", formality: 4 },
  { id: "g6", color: "Grey", formality: 5 },
  { id: "g7", color: "Red", formality: 2 },
];

const history = [
  { garmentIds: ["g1", "g3"], watchId: "w1", context: "clinic", date: "2026-03-01" },
  { garmentIds: ["g1", "g4"], watchId: "w1", context: "clinic", date: "2026-03-02" },
  { garmentIds: ["g2", "g5"], watchId: "w2", context: "casual", date: "2026-03-03" },
  { garmentIds: ["g3", "g6"], watchId: "w2", context: "casual", date: "2026-03-04" },
  { garmentIds: ["g1", "g3", "g5"], watchId: "w1", context: "clinic", date: "2026-03-05" },
];

const watches = [
  { id: "w1", model: "Speedmaster", brand: "Omega" },
  { id: "w2", model: "Reverso", brand: "JLC" },
];

describe("colorDNA", () => {
  it("counts worn color frequencies", () => {
    const result = colorDNA(history, garments);
    expect(result.worn.navy).toBe(4); // g1 (3x) + g2 (1x)
    expect(result.worn.black).toBe(3); // g3 (3x)
  });

  it("counts available color frequencies", () => {
    const result = colorDNA(history, garments);
    expect(result.available.navy).toBe(2); // g1, g2
    expect(result.available.black).toBe(1);
  });

  it("identifies over-indexed colors (worn more than available share)", () => {
    const result = colorDNA(history, garments);
    // overIndex: colors with index > 1.3
    expect(result.overIndex.length).toBeGreaterThanOrEqual(0);
    result.overIndex.forEach(c => expect(c.index).toBeGreaterThan(1.3));
  });

  it("identifies under-indexed colors (available but rarely worn)", () => {
    const result = colorDNA(history, garments);
    // underIndex: colors with index < 0.7 and availCount >= 2
    result.underIndex.forEach(c => {
      expect(c.index).toBeLessThan(0.7);
      expect(c.availCount).toBeGreaterThanOrEqual(2);
    });
  });

  it("handles empty history", () => {
    const result = colorDNA([], garments);
    expect(result.worn).toEqual({});
    expect(result.available).toBeDefined();
  });

  it("handles null history", () => {
    const result = colorDNA(null, garments);
    expect(result.worn).toEqual({});
    expect(result.overIndex).toEqual([]);
    expect(result.underIndex).toEqual([]);
  });

  it("handles garment with missing color", () => {
    const result = colorDNA(
      [{ garmentIds: ["gx"] }],
      [{ id: "gx" }]
    );
    expect(result.worn.unknown).toBe(1);
  });
});

describe("formalityDNA", () => {
  it("computes average formality", () => {
    const result = formalityDNA(history, garments);
    expect(result.average).toBeGreaterThan(0);
    expect(typeof result.average).toBe("number");
  });

  it("distributes into correct buckets", () => {
    const result = formalityDNA(history, garments);
    const total = Object.values(result.distribution).reduce((a, b) => a + b, 0);
    expect(total).toBe(history.length);
  });

  it("finds the mode bucket", () => {
    const result = formalityDNA(history, garments);
    expect(["1-3", "4-5", "6-7", "8-10"]).toContain(result.mode);
  });

  it("handles empty history", () => {
    const result = formalityDNA([], garments);
    expect(result.average).toBe(0);
    // When all buckets are 0, sort is stable — first bucket wins
    expect(["1-3", "4-5", "6-7", "8-10"]).toContain(result.mode);
  });

  it("handles null history", () => {
    const result = formalityDNA(null, garments);
    expect(result.average).toBe(0);
  });

  it("skips entries with no garment formality data", () => {
    const result = formalityDNA(
      [{ garmentIds: ["gx"] }],
      [{ id: "gx" }], // no formality
    );
    expect(result.average).toBe(0);
  });
});

describe("watchAffinityDNA", () => {
  it("groups color preferences by watch", () => {
    const result = watchAffinityDNA(history, garments, watches);
    expect(result.length).toBeGreaterThan(0);
    const w1 = result.find(r => r.watchId === "w1");
    expect(w1).toBeDefined();
    expect(w1.topColors.length).toBeGreaterThan(0);
  });

  it("includes model name from watches array", () => {
    const result = watchAffinityDNA(history, garments, watches);
    const w1 = result.find(r => r.watchId === "w1");
    expect(w1.model).toBe("Speedmaster");
    expect(w1.brand).toBe("Omega");
  });

  it("computes average formality per watch", () => {
    const result = watchAffinityDNA(history, garments, watches);
    result.forEach(r => {
      if (r.avgFormality !== null) {
        expect(r.avgFormality).toBeGreaterThanOrEqual(1);
        expect(r.avgFormality).toBeLessThanOrEqual(10);
      }
    });
  });

  it("filters out watches with < 2 wears", () => {
    const result = watchAffinityDNA(
      [{ watchId: "w-single", garmentIds: ["g1"] }],
      garments,
      watches
    );
    expect(result.find(r => r.watchId === "w-single")).toBeUndefined();
  });

  it("sorts by wear count descending", () => {
    const result = watchAffinityDNA(history, garments, watches);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].wearCount).toBeGreaterThanOrEqual(result[i].wearCount);
    }
  });

  it("handles null history", () => {
    expect(watchAffinityDNA(null, garments, watches)).toEqual([]);
  });
});

describe("contextDNA", () => {
  it("counts context distribution", () => {
    const result = contextDNA(history);
    expect(result.distribution.clinic).toBe(3);
    expect(result.distribution.casual).toBe(2);
    expect(result.total).toBe(5);
  });

  it("identifies top context", () => {
    const result = contextDNA(history);
    expect(result.topContext).toBe("clinic");
  });

  it("handles empty history", () => {
    const result = contextDNA([]);
    expect(result.total).toBe(0);
    expect(result.topContext).toBe("unset");
  });

  it("handles null history", () => {
    const result = contextDNA(null);
    expect(result.total).toBe(0);
  });

  it("defaults to 'unset' when no context field", () => {
    const result = contextDNA([{ garmentIds: ["g1"] }]);
    expect(result.distribution.unset).toBe(1);
  });
});

describe("comfortZoneDNA", () => {
  it("identifies staple garments (worn >= 3 times)", () => {
    const result = comfortZoneDNA(history, garments);
    result.staples.forEach(s => expect(s.wearCount).toBeGreaterThanOrEqual(3));
  });

  it("identifies ignored garments (never worn)", () => {
    const result = comfortZoneDNA(history, garments);
    result.ignored.forEach(s => expect(s.wearCount).toBe(0));
    // g7 (Red) was never worn
    expect(result.ignored.some(g => g.id === "g7")).toBe(true);
  });

  it("computes comfort percentage", () => {
    const result = comfortZoneDNA(history, garments);
    expect(result.comfortPct).toBeGreaterThanOrEqual(0);
    expect(result.comfortPct).toBeLessThanOrEqual(100);
  });

  it("handles empty history", () => {
    const result = comfortZoneDNA([], garments);
    expect(result.staples).toEqual([]);
    expect(result.comfortPct).toBe(0);
  });

  it("handles null history", () => {
    const result = comfortZoneDNA(null, garments);
    expect(result.staples).toEqual([]);
  });
});

describe("buildStyleDNA", () => {
  it("combines all analyses into a single report", () => {
    const result = buildStyleDNA(history, garments, watches);
    expect(result.color).toBeDefined();
    expect(result.formality).toBeDefined();
    expect(result.watchAffinity).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.comfortZone).toBeDefined();
    expect(result.entryCount).toBe(5);
    expect(result.garmentCount).toBe(7);
  });

  it("handles null history gracefully", () => {
    const result = buildStyleDNA(null, garments, watches);
    expect(result.entryCount).toBe(0);
    expect(result.color.worn).toEqual({});
  });
});
