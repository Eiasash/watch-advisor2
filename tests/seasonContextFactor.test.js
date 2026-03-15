import { describe, it, expect } from "vitest";
import seasonContextFactor, { currentSeason } from "../src/outfitEngine/scoringFactors/seasonContextFactor.js";

function makeCandidate(seasons = [], contexts = []) {
  return { garment: { id: "g1", seasons, contexts } };
}
// _season injection bypasses Date.getMonth() — no fragile Date mocking
function makeCtx(outfitContext = null, season = "spring") {
  return { outfitContext, _season: season };
}

describe("currentSeason", () => {
  it("returns a recognised season string", () => {
    expect(["spring","summer","autumn","winter"]).toContain(currentSeason());
  });
});

describe("seasonContextFactor — season scoring", () => {
  it("returns 0 for garment with no seasons field", () => {
    expect(seasonContextFactor({ garment: { id: "g1" } }, makeCtx())).toBe(0);
  });
  it("returns 0 for empty seasons array", () => {
    expect(seasonContextFactor(makeCandidate([]), makeCtx())).toBe(0);
  });
  it("returns 0 (neutral) for all-season garment", () => {
    expect(seasonContextFactor(makeCandidate(["all-season"]), makeCtx())).toBe(0);
  });
  it("returns +0.3 when season matches", () => {
    expect(seasonContextFactor(makeCandidate(["spring"]), makeCtx(null,"spring"))).toBe(0.3);
  });
  it("returns -0.2 when season does not match", () => {
    expect(seasonContextFactor(makeCandidate(["summer"]), makeCtx(null,"spring"))).toBe(-0.2);
  });
  it("returns +0.3 when one of multiple tags matches", () => {
    expect(seasonContextFactor(makeCandidate(["spring","autumn"]), makeCtx(null,"spring"))).toBe(0.3);
  });
  it("returns -0.2 for winter-only in spring", () => {
    expect(seasonContextFactor(makeCandidate(["winter"]), makeCtx(null,"spring"))).toBe(-0.2);
  });
  it("works for all four seasons", () => {
    for (const s of ["spring","summer","autumn","winter"])
      expect(seasonContextFactor(makeCandidate([s]), makeCtx(null,s))).toBe(0.3);
  });
});

describe("seasonContextFactor — context scoring", () => {
  it("returns 0 for garment with no contexts field", () => {
    expect(seasonContextFactor({ garment: { id:"g1" } }, makeCtx("clinic"))).toBe(0);
  });
  it("returns 0 for empty contexts array", () => {
    expect(seasonContextFactor(makeCandidate([],[]), makeCtx("clinic"))).toBe(0);
  });
  it("returns +0.25 when context matches", () => {
    expect(seasonContextFactor(makeCandidate([],["clinic","smart-casual"]), makeCtx("clinic"))).toBe(0.25);
  });
  it("returns 0 for context mismatch — no penalty", () => {
    expect(seasonContextFactor(makeCandidate([],["casual"]), makeCtx("clinic"))).toBe(0);
  });
  it("returns 0 when outfitContext is null", () => {
    expect(seasonContextFactor(makeCandidate([],["clinic"]), makeCtx(null))).toBe(0);
  });
});

describe("seasonContextFactor — combined", () => {
  it("+0.55 for perfect match (in-season + right context)", () => {
    expect(seasonContextFactor(
      makeCandidate(["spring"],["smart-casual"]),
      { outfitContext:"smart-casual", _season:"spring" }
    )).toBeCloseTo(0.55);
  });
  it("+0.05 for wrong season + right context (0.25 - 0.20)", () => {
    expect(seasonContextFactor(
      makeCandidate(["winter"],["clinic"]),
      { outfitContext:"clinic", _season:"spring" }
    )).toBeCloseTo(0.05);
  });
  it("+0.3 for right season + no context tag", () => {
    expect(seasonContextFactor(makeCandidate(["spring"],[]), { outfitContext:"clinic", _season:"spring" })).toBe(0.3);
  });
  it("returns 0 for null garment", () => {
    expect(seasonContextFactor({ garment:null }, makeCtx("clinic"))).toBe(0);
  });
  it("all-season + matching context = +0.25 only", () => {
    expect(seasonContextFactor(
      makeCandidate(["all-season"],["clinic"]),
      { outfitContext:"clinic", _season:"spring" }
    )).toBe(0.25);
  });
});

// ── Legacy "all" tag ──────────────────────────────────────────────────────────
describe("seasonContextFactor — legacy 'all' tag", () => {
  it("treats 'all' tag same as 'all-season' — neutral, no bonus/penalty", () => {
    expect(seasonContextFactor(makeCandidate(["all"]), makeCtx(null, "spring"))).toBe(0);
  });
  it("handles garment with both 'all' and specific seasons gracefully", () => {
    // If "all" is present it overrides everything to neutral
    expect(seasonContextFactor(makeCandidate(["all", "summer"]), makeCtx(null, "spring"))).toBe(0);
  });
});
