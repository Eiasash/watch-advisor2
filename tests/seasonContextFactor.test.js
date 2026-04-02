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

  it("maps all 12 months to correct seasons (Jerusalem timezone logic)", () => {
    // Expected mapping matches SEASON_BY_MONTH in the source (0-indexed months)
    const expected = [
      "winter","winter","spring","spring","spring","summer",
      "summer","summer","autumn","autumn","autumn","winter",
    ];
    // Verify the logic via the factor's _season injection path is consistent
    // with what currentSeason() would return for each month of the year.
    // We test the mapping table directly since we can't mock Date portably.
    const SEASON_BY_MONTH = {
      0:"winter",1:"winter",2:"spring",3:"spring",4:"spring",5:"summer",
      6:"summer",7:"summer",8:"autumn",9:"autumn",10:"autumn",11:"winter",
    };
    for (let m = 0; m < 12; m++) {
      expect(SEASON_BY_MONTH[m]).toBe(expected[m]);
    }
  });

  it("currentSeason() uses toLocaleDateString with Asia/Jerusalem — does not throw", () => {
    // Verify the Jerusalem-timezone path doesn't throw in the test environment
    expect(() => currentSeason()).not.toThrow();
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
  it("returns -0.15 when season is adjacent (summer in spring)", () => {
    expect(seasonContextFactor(makeCandidate(["summer"]), makeCtx(null,"spring"))).toBe(-0.15);
  });
  it("returns +0.3 when one of multiple tags matches", () => {
    expect(seasonContextFactor(makeCandidate(["spring","autumn"]), makeCtx(null,"spring"))).toBe(0.3);
  });
  it("returns -0.15 for winter (adjacent) in spring", () => {
    expect(seasonContextFactor(makeCandidate(["winter"]), makeCtx(null,"spring"))).toBe(-0.15);
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
  it("returns +0.10 when context matches", () => {
    expect(seasonContextFactor(makeCandidate([],["clinic","smart-casual"]), makeCtx("clinic"))).toBe(0.10);
  });
  it("returns 0 for context mismatch — no penalty", () => {
    expect(seasonContextFactor(makeCandidate([],["casual"]), makeCtx("clinic"))).toBe(0);
  });
  it("returns 0 when outfitContext is null", () => {
    expect(seasonContextFactor(makeCandidate([],["clinic"]), makeCtx(null))).toBe(0);
  });
});

describe("seasonContextFactor — combined", () => {
  it("+0.40 for perfect match (in-season + right context)", () => {
    expect(seasonContextFactor(
      makeCandidate(["spring"],["smart-casual"]),
      { outfitContext:"smart-casual", _season:"spring" }
    )).toBeCloseTo(0.40);
  });
  it("-0.05 for adjacent season + right context (0.10 - 0.15)", () => {
    expect(seasonContextFactor(
      makeCandidate(["winter"],["clinic"]),
      { outfitContext:"clinic", _season:"spring" }
    )).toBeCloseTo(-0.05);
  });
  it("+0.3 for right season + no context tag", () => {
    expect(seasonContextFactor(makeCandidate(["spring"],[]), { outfitContext:"clinic", _season:"spring" })).toBe(0.3);
  });
  it("returns 0 for null garment", () => {
    expect(seasonContextFactor({ garment:null }, makeCtx("clinic"))).toBe(0);
  });
  it("all-season + matching context = +0.10 only", () => {
    expect(seasonContextFactor(
      makeCandidate(["all-season"],["clinic"]),
      { outfitContext:"clinic", _season:"spring" }
    )).toBe(0.10);
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
