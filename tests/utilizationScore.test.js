import { describe, it, expect } from "vitest";
import { utilizationScore } from "../src/domain/rotationStats.js";
import { buildRotationMap } from "../src/domain/rotationSelectors.js";

// ── utilizationScore ──────────────────────────────────────────────────────────

describe("utilizationScore", () => {
  const w = (id) => ({ id, brand: "Test", model: id });

  it("returns 0 for empty watches array", () => {
    expect(utilizationScore([], [])).toBe(0);
  });

  it("returns 0 when no watches have been worn", () => {
    const watches = [w("a"), w("b"), w("c")];
    expect(utilizationScore(watches, [])).toBe(0);
  });

  it("returns 100 when all watches have been worn", () => {
    const watches = [w("a"), w("b"), w("c")];
    const history = [
      { watchId: "a", date: "2026-03-01" },
      { watchId: "b", date: "2026-03-02" },
      { watchId: "c", date: "2026-03-03" },
    ];
    expect(utilizationScore(watches, history)).toBe(100);
  });

  it("returns 67 when 2 of 3 watches have been worn", () => {
    const watches = [w("a"), w("b"), w("c")];
    const history = [
      { watchId: "a", date: "2026-03-01" },
      { watchId: "b", date: "2026-03-02" },
    ];
    expect(utilizationScore(watches, history)).toBe(67);
  });

  it("returns 50 when 1 of 2 watches worn", () => {
    const watches = [w("a"), w("b")];
    const history = [{ watchId: "a", date: "2026-03-01" }];
    expect(utilizationScore(watches, history)).toBe(50);
  });

  it("counts each watch once regardless of wear frequency", () => {
    const watches = [w("a"), w("b"), w("c"), w("d")];
    // "a" worn 10 times — still counts as 1 unique watch
    const history = Array.from({ length: 10 }, (_, i) => ({
      watchId: "a", date: `2026-02-${String(i + 1).padStart(2, "0")}`,
    }));
    // 1 of 4 = 25%
    expect(utilizationScore(watches, history)).toBe(25);
  });

  it("ignores history entries with null or missing watchId", () => {
    const watches = [w("a"), w("b")];
    const history = [
      { watchId: null,      date: "2026-03-01" },
      { watchId: undefined, date: "2026-03-02" },
      { watchId: "a",       date: "2026-03-03" },
    ];
    // Only "a" is valid — 1 of 2 = 50%
    expect(utilizationScore(watches, history)).toBe(50);
  });

  it("only counts watches that exist in the collection", () => {
    const watches = [w("a"), w("b"), w("c")];
    // "unknown" is in history but not in the collection — worn.size stays 0
    const history = [{ watchId: "unknown", date: "2026-03-01" }];
    expect(utilizationScore(watches, history)).toBe(0);
  });

  it("rounds correctly — 1 of 3 = 33%", () => {
    const watches = [w("a"), w("b"), w("c")];
    const history = [{ watchId: "a", date: "2026-03-01" }];
    expect(utilizationScore(watches, history)).toBe(33);
  });
});

// ── buildRotationMap ──────────────────────────────────────────────────────────

describe("buildRotationMap", () => {
  const watch = (id, priceILS = null) => ({ id, brand: "T", model: id, priceILS });

  it("returns empty object for empty watches", () => {
    expect(buildRotationMap([], [])).toEqual({});
  });

  it("keys result by watchId", () => {
    const map = buildRotationMap([watch("a"), watch("b")], []);
    expect(Object.keys(map).sort()).toEqual(["a", "b"]);
  });

  it("each entry has idle, wearCount, cpw fields", () => {
    const map = buildRotationMap([watch("a")], []);
    expect(map["a"]).toHaveProperty("idle");
    expect(map["a"]).toHaveProperty("wearCount");
    expect(map["a"]).toHaveProperty("cpw");
  });

  it("sets idle to Infinity for never-worn watch", () => {
    const map = buildRotationMap([watch("a")], []);
    expect(map["a"].idle).toBe(Infinity);
  });

  it("sets wearCount correctly", () => {
    const history = [
      { watchId: "a", date: "2026-03-01" },
      { watchId: "a", date: "2026-03-05" },
      { watchId: "b", date: "2026-03-02" },
    ];
    const map = buildRotationMap([watch("a"), watch("b")], history);
    expect(map["a"].wearCount).toBe(2);
    expect(map["b"].wearCount).toBe(1);
  });

  it("sets cpw to null when priceILS is missing", () => {
    const map = buildRotationMap([watch("a", null)], [{ watchId: "a", date: "2026-03-01" }]);
    expect(map["a"].cpw).toBeNull();
  });

  it("computes cpw correctly when priceILS present", () => {
    const history = [
      { watchId: "a", date: "2026-03-01" },
      { watchId: "a", date: "2026-03-02" },
    ];
    const map = buildRotationMap([watch("a", 24000)], history);
    expect(map["a"].cpw).toBe(12000); // 24000 / 2
  });
});
