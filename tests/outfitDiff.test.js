import { describe, it, expect } from "vitest";
import { computeOutfitDiff, hasDiff } from "../src/utils/outfitDiff.js";

const PICK_A = {
  watch: "Tudor BB41", watchId: "blackbay",
  shirt: "white linen", sweater: null, pants: "khaki chinos",
  shoes: "brown loafers", jacket: null,
};
const PICK_B = {
  watch: "GS Rikka", watchId: "rikka",
  shirt: "navy oxford", sweater: null, pants: "khaki chinos",
  shoes: "brown loafers", jacket: null,
};

describe("computeOutfitDiff (PR #154)", () => {
  it("identifies changed and kept slots", () => {
    const diff = computeOutfitDiff(PICK_A, PICK_B);
    expect(diff.changed.sort()).toEqual(["shirt", "watch"].sort());
    expect(diff.kept.sort()).toEqual(["pants", "shoes"].sort());
  });

  it("ignores slots that are null in both (no signal)", () => {
    const diff = computeOutfitDiff(PICK_A, PICK_B);
    // sweater + jacket are null in both → not in either array
    expect(diff.changed).not.toContain("sweater");
    expect(diff.kept).not.toContain("sweater");
    expect(diff.changed).not.toContain("jacket");
    expect(diff.kept).not.toContain("jacket");
  });

  it("treats null → value as a 'changed' transition", () => {
    const diff = computeOutfitDiff(
      { watchId: "a", sweater: null },
      { watchId: "a", sweater: "navy crewneck" },
    );
    expect(diff.changed).toContain("sweater");
    expect(diff.kept).toContain("watch");
  });

  it("treats value → null as a 'changed' transition", () => {
    const diff = computeOutfitDiff(
      { watchId: "a", jacket: "blazer" },
      { watchId: "a", jacket: null },
    );
    expect(diff.changed).toContain("jacket");
  });

  it("compares watch by watchId, labels as 'watch'", () => {
    // Different display name but same id → same watch (e.g., name typo fix)
    const diff = computeOutfitDiff(
      { watch: "Tudor Black Bay 41", watchId: "blackbay" },
      { watch: "Tudor BB41",          watchId: "blackbay" },
    );
    expect(diff.changed).not.toContain("watch");
    expect(diff.kept).toContain("watch");
  });

  it("missing inputs → empty diff (no crash on first AI call)", () => {
    expect(computeOutfitDiff(null, PICK_A)).toEqual({ changed: [], kept: [] });
    expect(computeOutfitDiff(PICK_A, null)).toEqual({ changed: [], kept: [] });
    expect(computeOutfitDiff(undefined, undefined)).toEqual({ changed: [], kept: [] });
  });

  it("identical picks → all kept, none changed", () => {
    const diff = computeOutfitDiff(PICK_A, { ...PICK_A });
    expect(diff.changed).toEqual([]);
    expect(diff.kept.sort()).toEqual(["pants", "shirt", "shoes", "watch"].sort());
  });
});

describe("hasDiff (PR #154)", () => {
  it("true when changed has items", () => {
    expect(hasDiff({ changed: ["shirt"], kept: [] })).toBe(true);
  });

  it("true when only kept has items", () => {
    expect(hasDiff({ changed: [], kept: ["watch"] })).toBe(true);
  });

  it("false when both empty (first AI call, no banner to show)", () => {
    expect(hasDiff({ changed: [], kept: [] })).toBe(false);
  });
});
