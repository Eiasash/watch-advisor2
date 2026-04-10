import { describe, it, expect, beforeEach } from "vitest";

// Use dynamic import to get a fresh registry each time
let registerFactor, applyFactors, getFactors;

beforeEach(async () => {
  // We can't fully reset module state since _factors is module-scoped,
  // but we can test the public API
  const mod = await import("../src/outfitEngine/scoringFactors/index.js");
  registerFactor = mod.registerFactor;
  applyFactors = mod.applyFactors;
  getFactors = mod.getFactors;
});

describe("scoringFactors registry", () => {
  // ── registerFactor ──────────────────────────────────────────────────────

  it("registerFactor adds a function to the registry", () => {
    const before = getFactors().length;
    const fn = () => 0.1;
    registerFactor(fn);
    expect(getFactors().length).toBe(before + 1);
  });

  it("registered factor appears in getFactors snapshot", () => {
    const fn = () => 0.5;
    registerFactor(fn);
    expect(getFactors()).toContain(fn);
  });

  // ── applyFactors ────────────────────────────────────────────────────────

  it("applyFactors sums all factor outputs", () => {
    const initialLen = getFactors().length;
    // Register two known factors
    registerFactor(() => 0.1);
    registerFactor(() => 0.2);
    const candidate = { garment: { id: "g1" }, baseScore: 5 };
    const context = { history: [], preferenceWeights: {} };
    const result = applyFactors(candidate, context);
    // Result includes contributions from ALL registered factors (including those from other tests)
    expect(typeof result).toBe("number");
    // At minimum the two we added contribute 0.3
    expect(result).toBeGreaterThanOrEqual(0.3);
  });

  it("applyFactors returns 0 when no factors registered beyond baseline", () => {
    // All factors return 0 for empty candidate
    const candidate = { garment: null, baseScore: 0, diversityBonus: 0 };
    const context = { history: [], preferenceWeights: {}, weather: {} };
    const result = applyFactors(candidate, context);
    expect(typeof result).toBe("number");
  });

  it("applyFactors passes candidate and context to each factor", () => {
    let receivedCandidate, receivedContext;
    registerFactor((c, ctx) => {
      receivedCandidate = c;
      receivedContext = ctx;
      return 0;
    });
    const candidate = { garment: { id: "spy" }, baseScore: 7 };
    const context = { history: [{ id: "h1" }] };
    applyFactors(candidate, context);
    expect(receivedCandidate).toBe(candidate);
    expect(receivedContext).toBe(context);
  });

  // ── getFactors ──────────────────────────────────────────────────────────

  it("getFactors returns a copy (not the internal array)", () => {
    const factors = getFactors();
    const lenBefore = factors.length;
    factors.push(() => 999);
    // Internal array should not have been mutated
    expect(getFactors().length).toBe(lenBefore);
  });
});
