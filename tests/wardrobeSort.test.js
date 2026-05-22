import { describe, it, expect } from "vitest";
import {
  sortGarmentsByWear,
  coerceSortMode,
  SORT_PREF_KEY,
} from "../src/domain/wardrobeSort.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** garment fixture — omit lastWorn for a never-worn garment */
function g(id, lastWorn) {
  return lastWorn === undefined ? { id } : { id, lastWorn };
}

const ids = arr => arr.map(x => x.id);

// ── coerceSortMode ────────────────────────────────────────────────────────────

describe("coerceSortMode", () => {
  it("passes 'recent' through", () => {
    expect(coerceSortMode("recent")).toBe("recent");
  });
  it("passes 'stale' through", () => {
    expect(coerceSortMode("stale")).toBe("stale");
  });
  it("defaults null/undefined/garbage to 'stale'", () => {
    expect(coerceSortMode(null)).toBe("stale");
    expect(coerceSortMode(undefined)).toBe("stale");
    expect(coerceSortMode("")).toBe("stale");
    expect(coerceSortMode("RECENT")).toBe("stale"); // case-sensitive
    expect(coerceSortMode("oldest")).toBe("stale");
    expect(coerceSortMode(42)).toBe("stale");
  });
});

describe("SORT_PREF_KEY", () => {
  it("is the documented per-device localStorage key", () => {
    expect(SORT_PREF_KEY).toBe("wa2-wardrobe-grid-sort");
  });
});

// ── stale mode (default) ──────────────────────────────────────────────────────

describe("sortGarmentsByWear — stale mode", () => {
  it("orders least-recently-worn first", () => {
    const input = [g("a", daysAgo(1)), g("b", daysAgo(30)), g("c", daysAgo(7))];
    expect(ids(sortGarmentsByWear(input, "stale"))).toEqual(["b", "c", "a"]);
  });

  it("places never-worn garments at the TOP", () => {
    const input = [g("worn-recent", daysAgo(2)), g("never"), g("worn-old", daysAgo(40))];
    expect(ids(sortGarmentsByWear(input, "stale"))).toEqual(["never", "worn-old", "worn-recent"]);
  });

  it("treats an unparseable lastWorn as never-worn (top)", () => {
    const input = [g("ok", daysAgo(5)), g("garbage", "not-a-date")];
    expect(ids(sortGarmentsByWear(input, "stale"))).toEqual(["garbage", "ok"]);
  });

  it("is the default mode when none is given", () => {
    const input = [g("a", daysAgo(1)), g("b", daysAgo(20))];
    expect(sortGarmentsByWear(input)).toEqual(sortGarmentsByWear(input, "stale"));
  });
});

// ── recent mode ───────────────────────────────────────────────────────────────

describe("sortGarmentsByWear — recent mode", () => {
  it("orders most-recently-worn first", () => {
    const input = [g("a", daysAgo(30)), g("b", daysAgo(1)), g("c", daysAgo(7))];
    expect(ids(sortGarmentsByWear(input, "recent"))).toEqual(["b", "c", "a"]);
  });

  it("places never-worn garments at the BOTTOM", () => {
    const input = [g("never"), g("worn-old", daysAgo(40)), g("worn-recent", daysAgo(2))];
    expect(ids(sortGarmentsByWear(input, "recent"))).toEqual(["worn-recent", "worn-old", "never"]);
  });

  it("treats an unparseable lastWorn as never-worn (bottom)", () => {
    const input = [g("garbage", "not-a-date"), g("ok", daysAgo(5))];
    expect(ids(sortGarmentsByWear(input, "recent"))).toEqual(["ok", "garbage"]);
  });
});

// ── equal-date tie-break — stable & deterministic ─────────────────────────────

describe("sortGarmentsByWear — equal-date tie-break", () => {
  it("breaks equal worn-dates deterministically by garment id (stale)", () => {
    const day = daysAgo(10);
    expect(ids(sortGarmentsByWear([g("c", day), g("a", day), g("b", day)], "stale")))
      .toEqual(["a", "b", "c"]);
  });

  it("breaks equal worn-dates deterministically by garment id (recent)", () => {
    const day = daysAgo(10);
    expect(ids(sortGarmentsByWear([g("c", day), g("a", day), g("b", day)], "recent")))
      .toEqual(["a", "b", "c"]);
  });

  it("breaks ties among never-worn garments by id, in both modes", () => {
    const input = [g("z"), g("m"), g("a")];
    expect(ids(sortGarmentsByWear(input, "stale"))).toEqual(["a", "m", "z"]);
    expect(ids(sortGarmentsByWear(input, "recent"))).toEqual(["a", "m", "z"]);
  });

  it("is order-independent — any input permutation yields the same result", () => {
    const day = daysAgo(3);
    const one = [g("b", day), g("a", day), g("c", daysAgo(9))];
    const two = [g("c", daysAgo(9)), g("a", day), g("b", day)];
    expect(ids(sortGarmentsByWear(one, "stale"))).toEqual(ids(sortGarmentsByWear(two, "stale")));
  });
});

// ── robustness ────────────────────────────────────────────────────────────────

describe("sortGarmentsByWear — robustness", () => {
  it("does not mutate the input array", () => {
    const input = [g("a", daysAgo(1)), g("b", daysAgo(30))];
    const snapshot = ids(input);
    sortGarmentsByWear(input, "stale");
    expect(ids(input)).toEqual(snapshot);
  });

  it("returns [] for non-array input", () => {
    expect(sortGarmentsByWear(null)).toEqual([]);
    expect(sortGarmentsByWear(undefined)).toEqual([]);
    expect(sortGarmentsByWear({})).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(sortGarmentsByWear([])).toEqual([]);
  });

  it("coerces an unknown mode to 'stale'", () => {
    const input = [g("a", daysAgo(1)), g("b", daysAgo(20))];
    expect(sortGarmentsByWear(input, "frequency")).toEqual(sortGarmentsByWear(input, "stale"));
  });
});

// ── composes after a type filter (survives type-tab change) ───────────────────

describe("sortGarmentsByWear — composes after a type filter", () => {
  it("sorts whatever subset the filter produced, not the whole wardrobe", () => {
    const wardrobe = [
      { id: "shirt-old", type: "shirt", lastWorn: daysAgo(40) },
      { id: "pants-new", type: "pants", lastWorn: daysAgo(1) },
      { id: "shirt-new", type: "shirt", lastWorn: daysAgo(2) },
      { id: "pants-old", type: "pants", lastWorn: daysAgo(30) },
    ];
    const shirts = wardrobe.filter(x => x.type === "shirt");
    expect(ids(sortGarmentsByWear(shirts, "stale"))).toEqual(["shirt-old", "shirt-new"]);
    expect(ids(sortGarmentsByWear(shirts, "recent"))).toEqual(["shirt-new", "shirt-old"]);
  });
});
