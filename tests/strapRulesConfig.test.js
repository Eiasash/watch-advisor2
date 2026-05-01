import { describe, it, expect } from "vitest";

import {
  BLACK_STRAP_TERMS,
  BROWN_STRAP_TERMS,
  BROWN_SHOE_COLORS,
  BLACK_SHOE_COLORS,
  EXEMPT_STRAP_TERMS,
  CASUAL_STRAP_TERMS,
  CASUAL_SHOE_SOFT_MATCH,
  CASUAL_SHOE_SOFT_MISS,
  SPECIAL_STRAP_RULES,
} from "../src/config/strapRules.js";

import {
  SCORE_WEIGHTS,
  STYLE_LEARN,
  OUTFIT_TEMP_THRESHOLDS,
  REPLICA_PENALTY,
} from "../src/config/scoringWeights.js";

// ---------------------------------------------------------------------------
// strapRules.js — data structure validation
// ---------------------------------------------------------------------------

describe("strapRules — BLACK_STRAP_TERMS", () => {
  it("contains 'black'", () => {
    expect(BLACK_STRAP_TERMS).toContain("black");
  });

  it("is an array of strings", () => {
    expect(Array.isArray(BLACK_STRAP_TERMS)).toBe(true);
    BLACK_STRAP_TERMS.forEach(t => expect(typeof t).toBe("string"));
  });
});

describe("strapRules — BROWN_STRAP_TERMS", () => {
  it("contains brown, tan, honey, cognac, caramel", () => {
    expect(BROWN_STRAP_TERMS).toContain("brown");
    expect(BROWN_STRAP_TERMS).toContain("tan");
    expect(BROWN_STRAP_TERMS).toContain("honey");
    expect(BROWN_STRAP_TERMS).toContain("cognac");
    expect(BROWN_STRAP_TERMS).toContain("caramel");
  });

  it("has at least 5 entries", () => {
    expect(BROWN_STRAP_TERMS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("strapRules — shoe color arrays", () => {
  it("BROWN_SHOE_COLORS includes brown, tan, cognac, dark brown", () => {
    expect(BROWN_SHOE_COLORS).toContain("brown");
    expect(BROWN_SHOE_COLORS).toContain("tan");
    expect(BROWN_SHOE_COLORS).toContain("cognac");
    expect(BROWN_SHOE_COLORS).toContain("dark brown");
  });

  it("BLACK_SHOE_COLORS includes black", () => {
    expect(BLACK_SHOE_COLORS).toContain("black");
  });
});

describe("strapRules — EXEMPT_STRAP_TERMS", () => {
  it("includes bracelet and integrated", () => {
    expect(EXEMPT_STRAP_TERMS).toContain("bracelet");
    expect(EXEMPT_STRAP_TERMS).toContain("integrated");
  });
});

describe("strapRules — CASUAL_STRAP_TERMS", () => {
  it("includes nato, canvas, rubber", () => {
    expect(CASUAL_STRAP_TERMS).toContain("nato");
    expect(CASUAL_STRAP_TERMS).toContain("canvas");
    expect(CASUAL_STRAP_TERMS).toContain("rubber");
  });
});

describe("strapRules — CASUAL_SHOE_SOFT_MATCH/MISS", () => {
  it("soft match colors include white, grey, tan", () => {
    expect(CASUAL_SHOE_SOFT_MATCH).toContain("white");
    expect(CASUAL_SHOE_SOFT_MATCH).toContain("grey");
    expect(CASUAL_SHOE_SOFT_MATCH).toContain("tan");
  });

  it("soft miss is a number less than 1", () => {
    expect(typeof CASUAL_SHOE_SOFT_MISS).toBe("number");
    expect(CASUAL_SHOE_SOFT_MISS).toBeLessThan(1);
    expect(CASUAL_SHOE_SOFT_MISS).toBeGreaterThan(0);
  });
});

describe("strapRules — SPECIAL_STRAP_RULES", () => {
  it("has rules for navy, grey, teal, olive, green", () => {
    expect(SPECIAL_STRAP_RULES).toHaveProperty("navy");
    expect(SPECIAL_STRAP_RULES).toHaveProperty("grey");
    expect(SPECIAL_STRAP_RULES).toHaveProperty("teal");
    expect(SPECIAL_STRAP_RULES).toHaveProperty("olive");
    expect(SPECIAL_STRAP_RULES).toHaveProperty("green");
  });

  it("each rule has 'allowed' array and numeric 'fallback'", () => {
    for (const [color, rule] of Object.entries(SPECIAL_STRAP_RULES)) {
      expect(Array.isArray(rule.allowed)).toBe(true);
      expect(rule.allowed.length).toBeGreaterThan(0);
      expect(typeof rule.fallback).toBe("number");
      expect(rule.fallback).toBeGreaterThanOrEqual(0);
      expect(rule.fallback).toBeLessThanOrEqual(1);
    }
  });

  it("navy allows black and brown shoes", () => {
    expect(SPECIAL_STRAP_RULES.navy.allowed).toContain("black");
    expect(SPECIAL_STRAP_RULES.navy.allowed).toContain("brown");
  });

  it("navy has fallback of 0.0 (hard block)", () => {
    expect(SPECIAL_STRAP_RULES.navy.fallback).toBe(0.0);
  });

  it("olive/green allow earth-tone shoes", () => {
    for (const color of ["olive", "green"]) {
      const rule = SPECIAL_STRAP_RULES[color];
      expect(rule.allowed).toContain("brown");
      expect(rule.allowed).toContain("tan");
      expect(rule.allowed).toContain("cognac");
    }
  });
});

// ---------------------------------------------------------------------------
// scoringWeights.js — data structure validation
// ---------------------------------------------------------------------------

describe("scoringWeights — SCORE_WEIGHTS", () => {
  it("has all expected weight keys", () => {
    expect(SCORE_WEIGHTS).toHaveProperty("colorMatch");
    expect(SCORE_WEIGHTS).toHaveProperty("formalityMatch");
    expect(SCORE_WEIGHTS).toHaveProperty("watchCompatibility");
    expect(SCORE_WEIGHTS).toHaveProperty("weatherLayer");
    expect(SCORE_WEIGHTS).toHaveProperty("contextFormality");
  });

  it("all weights are positive numbers", () => {
    for (const [key, val] of Object.entries(SCORE_WEIGHTS)) {
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThan(0);
    }
  });

  it("colorMatch is 2.5 (v2 rebalance)", () => {
    expect(SCORE_WEIGHTS.colorMatch).toBe(2.5);
  });

  it("formalityMatch is 3", () => {
    expect(SCORE_WEIGHTS.formalityMatch).toBe(3);
  });

  it("contextFormality is reduced to 0.5 (v2 rebalance)", () => {
    expect(SCORE_WEIGHTS.contextFormality).toBe(0.5);
  });
});

describe("scoringWeights — STYLE_LEARN", () => {
  it("has min and max properties", () => {
    expect(STYLE_LEARN).toHaveProperty("min");
    expect(STYLE_LEARN).toHaveProperty("max");
  });

  it("min < 1 < max (soft multiplier)", () => {
    expect(STYLE_LEARN.min).toBeLessThan(1);
    expect(STYLE_LEARN.max).toBeGreaterThan(1);
  });

  it("min is 0.85 and max is 1.15", () => {
    expect(STYLE_LEARN.min).toBe(0.85);
    expect(STYLE_LEARN.max).toBe(1.15);
  });
});

describe("scoringWeights — OUTFIT_TEMP_THRESHOLDS", () => {
  it("has warmTransition and layerDouble thresholds", () => {
    expect(OUTFIT_TEMP_THRESHOLDS).toHaveProperty("warmTransition");
    expect(OUTFIT_TEMP_THRESHOLDS).toHaveProperty("layerDouble");
  });

  it("warmTransition (10) > layerDouble (8)", () => {
    expect(OUTFIT_TEMP_THRESHOLDS.warmTransition).toBe(10);
    expect(OUTFIT_TEMP_THRESHOLDS.layerDouble).toBe(8);
    expect(OUTFIT_TEMP_THRESHOLDS.warmTransition).toBeGreaterThan(OUTFIT_TEMP_THRESHOLDS.layerDouble);
  });
});

describe("scoringWeights — REPLICA_PENALTY", () => {
  it("is a number between 0 and 1", () => {
    expect(typeof REPLICA_PENALTY).toBe("number");
    expect(REPLICA_PENALTY).toBeGreaterThan(0);
    expect(REPLICA_PENALTY).toBeLessThanOrEqual(1);
  });

  it("is 0.60", () => {
    expect(REPLICA_PENALTY).toBe(0.60);
  });
});
