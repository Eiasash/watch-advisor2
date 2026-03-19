import { describe, it, expect } from "vitest";
import { recentGarments, repetitionPenalty, MEMORY_WINDOW } from "../src/domain/contextMemory.js";

function makeHistory(garmentIdArrays) {
  return garmentIdArrays.map((ids, i) => ({ garmentIds: ids, date: `2026-03-${String(i + 1).padStart(2, "0")}` }));
}

describe("recentGarments", () => {
  it("returns empty set for empty history", () => {
    expect(recentGarments([]).size).toBe(0);
  });

  it("returns empty set for null/undefined history", () => {
    expect(recentGarments(null).size).toBe(0);
    expect(recentGarments(undefined).size).toBe(0);
  });

  it("collects garmentIds from last MEMORY_WINDOW entries", () => {
    const history = makeHistory([
      ["g1", "g2"],
      ["g3"],
      ["g4"],
      ["g5"],
      ["g6"],
    ]);
    const set = recentGarments(history);
    expect(set.has("g1")).toBe(true);
    expect(set.has("g6")).toBe(true);
  });

  it("only includes the last MEMORY_WINDOW entries (ignores older)", () => {
    const older = makeHistory([["old1"], ["old2"]]);
    const recent = makeHistory([["g1"], ["g2"], ["g3"], ["g4"], ["g5"]]);
    const history = [...older, ...recent];
    const set = recentGarments(history);
    expect(set.has("old1")).toBe(false);
    expect(set.has("old2")).toBe(false);
    expect(set.has("g1")).toBe(true);
  });

  it("reads garmentIds from payload.garmentIds when garmentIds absent", () => {
    const history = [{ payload: { garmentIds: ["g99"] }, date: "2026-03-01" }];
    expect(recentGarments(history).has("g99")).toBe(true);
  });

  it("MEMORY_WINDOW is 5", () => {
    expect(MEMORY_WINDOW).toBe(5);
  });
});

describe("repetitionPenalty", () => {
  it("returns -0.28 when garment is in recent history", () => {
    const history = makeHistory([["g1", "g2"]]);
    expect(repetitionPenalty("g1", history)).toBe(-0.28);
  });

  it("returns 0 when garment is NOT in recent history", () => {
    const history = makeHistory([["g1", "g2"]]);
    expect(repetitionPenalty("g99", history)).toBe(0);
  });

  it("returns 0 for empty history", () => {
    expect(repetitionPenalty("g1", [])).toBe(0);
  });

  it("returns 0 for null history", () => {
    expect(repetitionPenalty("g1", null)).toBe(0);
  });

  it("ignores garments older than MEMORY_WINDOW entries", () => {
    const old   = makeHistory([["g_old"]]);
    const fresh = makeHistory([["g1"], ["g2"], ["g3"], ["g4"], ["g5"]]);
    const history = [...old, ...fresh];
    expect(repetitionPenalty("g_old", history)).toBe(0);
  });
});
