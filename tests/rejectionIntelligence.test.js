import { describe, it, expect } from "vitest";
import { buildRejectionProfile, rejectedColorCombos } from "../src/domain/rejectionIntelligence.js";

describe("buildRejectionProfile — penalty tiers", () => {
  it("returns 0 penalty for unknown garment", () => {
    const { penaltyFor } = buildRejectionProfile([]);
    expect(penaltyFor("unknown-id", "clinic")).toBe(0);
  });

  it("returns 0 penalty for 1 rejection (noise)", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic", reason: "too formal" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    expect(penaltyFor("g1", "clinic")).toBe(0);
  });

  it("returns -0.10 for 2 rejections (mild signal)", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    expect(penaltyFor("g1", "clinic")).toBe(-0.10);
  });

  it("returns -0.25 for 3+ rejections (strong signal)", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    expect(penaltyFor("g1", "clinic")).toBe(-0.25);
  });

  it("returns -0.35 for 3+ rejections with same reason (systematic)", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic", reason: "too loud" },
      { garmentIds: ["g1"], context: "casual", reason: "too loud" },
      { garmentIds: ["g1"], context: "clinic", reason: "too loud" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    expect(penaltyFor("g1", "clinic")).toBe(-0.35);
  });

  it("considers context-specific rejections", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "casual" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    // 2 clinic rejections → should apply a penalty for clinic context
    const clinicPenalty = penaltyFor("g1", "clinic");
    expect(clinicPenalty).toBeLessThan(0);
  });

  it("uses total/2 as floor for non-matching context", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
    ];
    const { penaltyFor } = buildRejectionProfile(entries);
    // For "casual" context: ctxCount=0, total/2=2 → effectiveCount=2 → -0.10
    expect(penaltyFor("g1", "casual")).toBe(-0.10);
  });
});

describe("buildRejectionProfile — insights", () => {
  it("generates insights for garments with 3+ rejections", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic", reason: "color clash" },
      { garmentIds: ["g1"], context: "clinic", reason: "color clash" },
      { garmentIds: ["g1"], context: "casual", reason: "too formal" },
    ];
    const { insights } = buildRejectionProfile(entries);
    expect(insights.length).toBe(1);
    expect(insights[0].garmentId).toBe("g1");
    expect(insights[0].totalRejections).toBe(3);
    expect(insights[0].primaryReason).toBe("color clash");
    expect(insights[0].primaryReasonCount).toBe(2);
  });

  it("no insights for garments with < 3 rejections", () => {
    const entries = [
      { garmentIds: ["g1"], context: "clinic" },
      { garmentIds: ["g1"], context: "clinic" },
    ];
    const { insights } = buildRejectionProfile(entries);
    expect(insights.length).toBe(0);
  });

  it("handles empty entries", () => {
    const { insights, penaltyFor } = buildRejectionProfile([]);
    expect(insights).toEqual([]);
    expect(penaltyFor("any")).toBe(0);
  });

  it("handles default (no entries arg)", () => {
    const { insights } = buildRejectionProfile();
    expect(insights).toEqual([]);
  });
});

describe("buildRejectionProfile — garmentRejects exposed", () => {
  it("exposes the raw garmentRejects map", () => {
    const entries = [
      { garmentIds: ["g1", "g2"], context: "clinic" },
    ];
    const { garmentRejects } = buildRejectionProfile(entries);
    expect(garmentRejects.g1).toBeDefined();
    expect(garmentRejects.g1.total).toBe(1);
    expect(garmentRejects.g2.total).toBe(1);
  });
});

describe("rejectedColorCombos", () => {
  const garments = [
    { id: "g1", color: "Navy" },
    { id: "g2", color: "Black" },
    { id: "g3", color: "Brown" },
    { id: "g4", color: "Navy" },
  ];

  it("finds color pairs rejected 2+ times", () => {
    const entries = [
      { garmentIds: ["g1", "g2"] }, // navy|black
      { garmentIds: ["g1", "g2"] }, // navy|black again
      { garmentIds: ["g1", "g3"] }, // navy|brown (only 1 time)
    ];
    const combos = rejectedColorCombos(entries, garments);
    expect(combos.length).toBe(1);
    expect(combos[0].colors).toContain("black");
    expect(combos[0].colors).toContain("navy");
    expect(combos[0].count).toBe(2);
  });

  it("filters out combos with count < 2", () => {
    const entries = [
      { garmentIds: ["g1", "g2"] }, // single occurrence
    ];
    const combos = rejectedColorCombos(entries, garments);
    expect(combos.length).toBe(0);
  });

  it("sorts by count descending", () => {
    const entries = [
      { garmentIds: ["g1", "g2"] },
      { garmentIds: ["g1", "g2"] },
      { garmentIds: ["g1", "g2"] },
      { garmentIds: ["g1", "g3"] },
      { garmentIds: ["g1", "g3"] },
    ];
    const combos = rejectedColorCombos(entries, garments);
    for (let i = 1; i < combos.length; i++) {
      expect(combos[i - 1].count).toBeGreaterThanOrEqual(combos[i].count);
    }
  });

  it("handles entries with missing garment", () => {
    const entries = [
      { garmentIds: ["g1", "nonexistent"] },
      { garmentIds: ["g1", "nonexistent"] },
    ];
    const combos = rejectedColorCombos(entries, garments);
    // nonexistent garment's color is undefined → filtered out
    expect(combos.length).toBe(0);
  });

  it("handles empty entries", () => {
    expect(rejectedColorCombos([], garments)).toEqual([]);
  });

  it("normalizes colors to lowercase for pairing", () => {
    const upperGarments = [
      { id: "g1", color: "NAVY" },
      { id: "g2", color: "navy" },
    ];
    const entries = [
      { garmentIds: ["g1", "g2"] },
      { garmentIds: ["g1", "g2"] },
    ];
    const combos = rejectedColorCombos(entries, upperGarments);
    // Both "NAVY" and "navy" should normalize to "navy" — same color pair
    // navy|navy is a self-pair, count = 2
    expect(combos.length).toBe(1);
  });
});
