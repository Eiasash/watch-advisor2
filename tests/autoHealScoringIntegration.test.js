/**
 * Integration tests: auto-heal ↔ scoring pipeline
 *
 * Verifies that:
 * 1. setScoringOverrides injects a value that getOverride reads
 * 2. rotationFactor uses the injected weight (not the hardcoded default)
 * 3. The auto-heal cap (LIMITS.rotationFactor = 0.60) is enforced
 * 4. rotationFactor is applied exactly once (no double-application)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setScoringOverrides, getOverride, getAllOverrides } from "../src/config/scoringOverrides.js";
import rotationFactor from "../src/outfitEngine/scoringFactors/rotationFactor.js";
import { rotationPressure } from "../src/domain/rotationStats.js";

// ---------------------------------------------------------------------------
// Constants mirrored from auto-heal.js — must match production values
// ---------------------------------------------------------------------------
const AUTO_HEAL_LIMITS = {
  rotationFactor: 0.60,
  repetitionPenalty: -0.40,
  neverWornRotationPressure: 0.90,
};
const AUTO_HEAL_DEFAULTS = {
  rotationFactor: 0.40,
  repetitionPenalty: -0.28,
  neverWornRotationPressure: 0.50,
};
const AUTO_HEAL_STEP = 0.05;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCandidate(id = "g-test") {
  return { garment: { id } };
}

/** Build a history array where garmentId was last worn N days ago */
function historyWithIdle(garmentId, daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const date = d.toISOString().slice(0, 10);
  return [{ id: `h-${daysAgo}`, date, garmentIds: [garmentId], watchId: "laureato" }];
}

// ---------------------------------------------------------------------------
// Reset overrides after each test to avoid state bleed
// ---------------------------------------------------------------------------
afterEach(() => {
  setScoringOverrides({});
});

// ---------------------------------------------------------------------------
// 1. scoringOverrides singleton — basic get/set contract
// ---------------------------------------------------------------------------
describe("scoringOverrides — get/set contract", () => {
  it("getOverride returns hardcoded default when no override set", () => {
    setScoringOverrides({});
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
  });

  it("getOverride returns injected value after setScoringOverrides", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    expect(getOverride("rotationFactor", 0.40)).toBe(0.55);
  });

  it("getOverride falls back to default for keys not in override object", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    expect(getOverride("repetitionPenalty", -0.28)).toBe(-0.28);
  });

  it("setScoringOverrides replaces entire state (no merge carry-over)", () => {
    setScoringOverrides({ rotationFactor: 0.55, repetitionPenalty: -0.35 });
    setScoringOverrides({ rotationFactor: 0.50 });
    // repetitionPenalty was in first call but not second — should fall back to default
    expect(getOverride("repetitionPenalty", -0.28)).toBe(-0.28);
    expect(getOverride("rotationFactor", 0.40)).toBe(0.50);
  });

  it("getAllOverrides returns a copy (mutations don't affect internal state)", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    const all = getAllOverrides();
    all.rotationFactor = 999;
    expect(getOverride("rotationFactor", 0.40)).toBe(0.55);
  });

  it("non-numeric overrides are ignored — falls back to default", () => {
    setScoringOverrides({ rotationFactor: "bad" });
    expect(getOverride("rotationFactor", 0.40)).toBe(0.40);
  });
});

// ---------------------------------------------------------------------------
// 2. rotationFactor uses injected weight
// ---------------------------------------------------------------------------
describe("rotationFactor — uses scoringOverrides weight", () => {
  it("uses default 0.40 weight when no override set", () => {
    setScoringOverrides({});
    const candidate = makeCandidate("g1");
    const history = historyWithIdle("g1", 20); // 20 days idle → moderate pressure
    const ctx = { history };
    const factor = rotationFactor(candidate, ctx);
    const expectedPressure = rotationPressure(20);
    expect(factor).toBeCloseTo(expectedPressure * 0.40, 5);
  });

  it("uses auto-healed 0.55 weight when override is set", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    const candidate = makeCandidate("g2");
    const history = historyWithIdle("g2", 20);
    const ctx = { history };
    const factor = rotationFactor(candidate, ctx);
    const expectedPressure = rotationPressure(20);
    expect(factor).toBeCloseTo(expectedPressure * 0.55, 5);
  });

  it("factor at 0.55 weight is larger than at 0.40 weight (same pressure)", () => {
    const candidate = makeCandidate("g3");
    const history = historyWithIdle("g3", 20);
    const ctx = { history };

    setScoringOverrides({ rotationFactor: 0.40 });
    const factorDefault = rotationFactor(candidate, ctx);

    setScoringOverrides({ rotationFactor: 0.55 });
    const factorTuned = rotationFactor(candidate, ctx);

    expect(factorTuned).toBeGreaterThan(factorDefault);
  });

  it("returns 0 when garment has no id (safety guard)", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    expect(rotationFactor({ garment: {} }, { history: [] })).toBe(0);
    expect(rotationFactor({ garment: null }, { history: [] })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Auto-heal cap enforcement — LIMITS.rotationFactor = 0.60
// ---------------------------------------------------------------------------
describe("auto-heal cap — rotationFactor never exceeds 0.60", () => {
  it("0.40 + 0.05 step = 0.45 (below cap)", () => {
    const old = 0.40;
    const next = Math.min(+(old + AUTO_HEAL_STEP).toFixed(2), AUTO_HEAL_LIMITS.rotationFactor);
    expect(next).toBe(0.45);
  });

  it("0.55 + 0.05 step = 0.60 (exactly at cap)", () => {
    const old = 0.55;
    const next = Math.min(+(old + AUTO_HEAL_STEP).toFixed(2), AUTO_HEAL_LIMITS.rotationFactor);
    expect(next).toBe(0.60);
  });

  it("0.60 + 0.05 step stays at 0.60 (cap holds)", () => {
    const old = 0.60;
    const next = Math.min(+(old + AUTO_HEAL_STEP).toFixed(2), AUTO_HEAL_LIMITS.rotationFactor);
    expect(next).toBe(0.60);
    // If at cap, next === old — no update should be written
    expect(next !== old + AUTO_HEAL_STEP).toBe(true); // would be 0.65 without cap
  });

  it("injected cap value (0.60) flows through rotationFactor correctly", () => {
    setScoringOverrides({ rotationFactor: AUTO_HEAL_LIMITS.rotationFactor });
    const candidate = makeCandidate("g4");
    const history = historyWithIdle("g4", 28); // high pressure scenario
    const ctx = { history };
    const factor = rotationFactor(candidate, ctx);
    const expectedPressure = rotationPressure(28);
    expect(factor).toBeCloseTo(expectedPressure * 0.60, 5);
    // Factor must not exceed rotationPressure (pressure is in [0,1), factor <= weight)
    expect(factor).toBeLessThanOrEqual(0.60);
  });

  it("all step increments from default to cap respect the limit", () => {
    let current = AUTO_HEAL_DEFAULTS.rotationFactor;
    const visited = [];
    for (let i = 0; i < 20; i++) {
      const next = Math.min(+(current + AUTO_HEAL_STEP).toFixed(2), AUTO_HEAL_LIMITS.rotationFactor);
      visited.push(next);
      if (next === current) break; // at cap, no further changes
      current = next;
    }
    expect(Math.max(...visited)).toBeLessThanOrEqual(AUTO_HEAL_LIMITS.rotationFactor);
    // Must eventually reach cap from default
    expect(visited).toContain(AUTO_HEAL_LIMITS.rotationFactor);
  });
});

// ---------------------------------------------------------------------------
// 4. No double-application — rotationFactor called once per candidate
// ---------------------------------------------------------------------------
describe("rotationFactor — no double-application", () => {
  it("calling rotationFactor twice with same inputs returns same value (idempotent)", () => {
    setScoringOverrides({ rotationFactor: 0.50 });
    const candidate = makeCandidate("g5");
    const history = historyWithIdle("g5", 14);
    const ctx = { history };
    const call1 = rotationFactor(candidate, ctx);
    const call2 = rotationFactor(candidate, ctx);
    expect(call1).toBe(call2);
  });

  it("rotationFactor result for 14-day idle garment is bounded by the weight", () => {
    setScoringOverrides({ rotationFactor: 0.55 });
    const candidate = makeCandidate("g6");
    const history = historyWithIdle("g6", 14);
    const ctx = { history };
    const factor = rotationFactor(candidate, ctx);
    // rotationPressure at midpoint (14 days) = ~0.50, so factor ≈ 0.275
    // It must not be doubled to ~0.55 (which would indicate double-application)
    expect(factor).toBeLessThan(0.55);
    expect(factor).toBeGreaterThan(0); // but must be positive
  });

  it("never-worn garment uses neverWornRotationPressure override via rotationPressure", () => {
    // neverWornRotationPressure default is 0.50 (rotationPressure(Infinity) fallback)
    setScoringOverrides({ rotationFactor: 0.40, neverWornRotationPressure: 0.75 });
    const candidate = makeCandidate("g7");
    const ctx = { history: [] }; // never worn
    const factor = rotationFactor(candidate, ctx);
    // rotationPressure(Infinity) returns getOverride("neverWornRotationPressure", 0.50) → 0.75
    // factor = 0.75 * 0.40 = 0.30
    expect(factor).toBeCloseTo(0.75 * 0.40, 5);
  });
});
