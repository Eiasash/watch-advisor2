import { describe, it, expect } from "vitest";

/**
 * Bad-prop hardening regression for WatchSuggestionFromOutfit (v1.13.14).
 *
 * v1.13.12 shipped the component and live ErrorBoundary caught React #310
 * ("fewer hooks than previous render") on bundle index-CUR3tBfc.js. Root
 * cause: useMemo callbacks could throw when `selected` was undefined or
 * non-iterable during a hydration race; the throw inside the hook executor
 * bypassed subsequent hooks and tripped React's hook-count invariant.
 *
 * v1.13.14 hardened every callback. This test pins the property: bad props
 * must NEVER throw — degrade to empty results.
 *
 * The helper below mirrors the inline implementation in
 * src/components/today/WatchSuggestionFromOutfit.jsx so we can unit-test
 * the throw-resistance contract without a React renderer.
 */

const SLOTS = ["shirt", "pants", "shoes", "jacket", "sweater", "belt"];

// Minimal normalizeType stub — real implementation lives in
// src/classifier/normalizeType.js. The mirror here just covers what the
// test cases exercise.
function normalizeType(t) {
  const s = String(t ?? "").toLowerCase().trim();
  if (!s) return null;
  if (SLOTS.includes(s)) return s;
  return null;
}

function buildOutfitFromSelected(selected, garments) {
  const out = {};
  if (!selected || typeof selected[Symbol.iterator] !== "function") return out;
  if (!Array.isArray(garments) || garments.length === 0) return out;
  try {
    for (const id of selected) {
      const g = garments.find(x => x?.id === id);
      if (!g) continue;
      const slot = normalizeType(g.type ?? g.category ?? "") || "accessory";
      if (SLOTS.includes(slot) && !out[slot]) out[slot] = g;
    }
  } catch (_) { return out; }
  return out;
}

describe("buildOutfitFromSelected — bad-prop hardening (#310 regression)", () => {
  it("returns {} for undefined selected", () => {
    expect(buildOutfitFromSelected(undefined, [{ id: "a", type: "shirt" }])).toEqual({});
  });

  it("returns {} for null selected", () => {
    expect(buildOutfitFromSelected(null, [{ id: "a", type: "shirt" }])).toEqual({});
  });

  it("returns {} for non-iterable selected (object instead of Set)", () => {
    expect(buildOutfitFromSelected({}, [{ id: "a", type: "shirt" }])).toEqual({});
  });

  it("returns {} for undefined garments", () => {
    expect(buildOutfitFromSelected(new Set(["a"]), undefined)).toEqual({});
  });

  it("returns {} for non-array garments", () => {
    expect(buildOutfitFromSelected(new Set(["a"]), { a: 1 })).toEqual({});
  });

  it("returns {} for empty Set", () => {
    expect(buildOutfitFromSelected(new Set(), [{ id: "a", type: "shirt" }])).toEqual({});
  });

  it("returns {} for empty garments", () => {
    expect(buildOutfitFromSelected(new Set(["a"]), [])).toEqual({});
  });

  it("survives garments with null entries", () => {
    expect(buildOutfitFromSelected(new Set(["a"]), [null, { id: "a", type: "shirt" }]))
      .toEqual({ shirt: { id: "a", type: "shirt" } });
  });

  it("survives selected with non-string ids", () => {
    expect(buildOutfitFromSelected(new Set([null, undefined, "a"]), [{ id: "a", type: "shirt" }]))
      .toEqual({ shirt: { id: "a", type: "shirt" } });
  });

  it("happy path: maps selected ids to slots", () => {
    const result = buildOutfitFromSelected(
      new Set(["s1", "p1"]),
      [{ id: "s1", type: "shirt" }, { id: "p1", type: "pants" }],
    );
    expect(Object.keys(result).sort()).toEqual(["pants", "shirt"]);
  });

  it("first-wins on duplicate slots", () => {
    const result = buildOutfitFromSelected(
      new Set(["s1", "s2"]),
      [{ id: "s1", type: "shirt" }, { id: "s2", type: "shirt" }],
    );
    // Only first matching shirt kept
    expect(result.shirt.id).toBe("s1");
  });

  it("never throws on poisoned iterator", () => {
    const poisoned = {
      [Symbol.iterator]() {
        return {
          next() { throw new Error("evil iterator"); },
        };
      },
    };
    expect(() => buildOutfitFromSelected(poisoned, [{ id: "a", type: "shirt" }])).not.toThrow();
    expect(buildOutfitFromSelected(poisoned, [{ id: "a", type: "shirt" }])).toEqual({});
  });
});
