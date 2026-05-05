/**
 * tests/aiPickResolver.test.js
 *
 * Pinning tests for the AI pick → wardrobe ID resolution.
 *
 * Original WeekPlanner.jsx code did:
 *   const match = garments.find(g =>
 *     g.name === name || g.name?.toLowerCase() === name?.toLowerCase());
 *
 * That broke silently for AI responses with:
 *   - trailing whitespace
 *   - quoted names ("Some Polo")
 *   - trailing punctuation ("Polo.")
 *   - smart quotes
 * The slot would fall back to engine pick, the user saw an outfit that
 * didn't match Claude's reasoning, and there was no surfaced warning.
 *
 * Also pins the new defensive validation around watch picks in
 * Different-watch mode — Claude must return a watchId the user owns AND is
 * active (not retired, not pending).
 */

import { describe, it, expect } from "vitest";
import {
  normalizeAiName,
  resolveGarmentSlots,
  validateDifferentWatchPick,
} from "../src/utils/aiPickResolver.js";

// ── normalizeAiName ──────────────────────────────────────────────────────────

describe("normalizeAiName", () => {
  it("lowercases", () => {
    expect(normalizeAiName("Navy Polo")).toBe("navy polo");
  });

  it("trims whitespace", () => {
    expect(normalizeAiName("  Navy Polo  ")).toBe("navy polo");
  });

  it("strips a single layer of straight double quotes", () => {
    expect(normalizeAiName('"Navy Polo"')).toBe("navy polo");
  });

  it("strips a single layer of straight single quotes", () => {
    expect(normalizeAiName("'Navy Polo'")).toBe("navy polo");
  });

  it("strips smart double quotes (Claude sometimes returns these)", () => {
    expect(normalizeAiName("\u201CNavy Polo\u201D")).toBe("navy polo");
  });

  it("strips trailing period", () => {
    expect(normalizeAiName("Navy Polo.")).toBe("navy polo");
  });

  it("strips trailing comma", () => {
    expect(normalizeAiName("Navy Polo,")).toBe("navy polo");
  });

  it("does not strip mid-string punctuation", () => {
    expect(normalizeAiName("PNT-6562, Navy")).toBe("pnt-6562, navy");
    // ↑ trailing comma stripped from the very end, but mid-string preserved
  });

  it("non-string returns empty string (defensive)", () => {
    expect(normalizeAiName(null)).toBe("");
    expect(normalizeAiName(undefined)).toBe("");
    expect(normalizeAiName(42)).toBe("");
    expect(normalizeAiName({})).toBe("");
  });

  it("only strips ONE layer of quotes (preserves nested)", () => {
    expect(normalizeAiName(`"Navy 'Special' Polo"`)).toBe("navy 'special' polo");
  });
});

// ── resolveGarmentSlots ──────────────────────────────────────────────────────

const GARMENTS = [
  { id: "g1", name: "Navy Polo" },
  { id: "g2", name: "Khaki Chinos" },
  { id: "g3", name: "Brown Ecco Daily" },
  { id: "g4", name: "Black Cable Knit" },
  { id: "g5", name: "Camel Coat" },
];
const SLOTS = ["shirt", "sweater", "pants", "shoes", "jacket"];

describe("resolveGarmentSlots — happy path", () => {
  it("maps exact names to IDs", () => {
    const pick = {
      shirt: "Navy Polo",
      pants: "Khaki Chinos",
      shoes: "Brown Ecco Daily",
      sweater: null,
      jacket: null,
    };
    const { overrides, unmatched } = resolveGarmentSlots(pick, GARMENTS, SLOTS);
    expect(overrides.shirt).toBe("g1");
    expect(overrides.pants).toBe("g2");
    expect(overrides.shoes).toBe("g3");
    expect(overrides.sweater).toBeNull();
    expect(overrides.jacket).toBeNull();
    expect(unmatched).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const { overrides } = resolveGarmentSlots({ shirt: "navy polo" }, GARMENTS, SLOTS);
    expect(overrides.shirt).toBe("g1");
  });

  it("matches with whitespace padding (was a real bug)", () => {
    const { overrides } = resolveGarmentSlots({ shirt: "  Navy Polo  " }, GARMENTS, SLOTS);
    expect(overrides.shirt).toBe("g1");
  });

  it("matches with surrounding quotes (was a real bug)", () => {
    const { overrides } = resolveGarmentSlots({ shirt: '"Navy Polo"' }, GARMENTS, SLOTS);
    expect(overrides.shirt).toBe("g1");
  });

  it("matches with trailing period (was a real bug)", () => {
    const { overrides } = resolveGarmentSlots({ pants: "Khaki Chinos." }, GARMENTS, SLOTS);
    expect(overrides.pants).toBe("g2");
  });
});

describe("resolveGarmentSlots — explicit null", () => {
  it("accepts literal null → overrides[slot] = null", () => {
    const { overrides } = resolveGarmentSlots({ jacket: null }, GARMENTS, SLOTS);
    expect(overrides.jacket).toBeNull();
  });

  it('accepts the string "null" → overrides[slot] = null', () => {
    const { overrides } = resolveGarmentSlots({ jacket: "null" }, GARMENTS, SLOTS);
    expect(overrides.jacket).toBeNull();
  });

  it("accepts empty string → overrides[slot] = null", () => {
    const { overrides } = resolveGarmentSlots({ jacket: "" }, GARMENTS, SLOTS);
    expect(overrides.jacket).toBeNull();
  });
});

describe("resolveGarmentSlots — unmatched names surface for warning", () => {
  it("hallucinated name → not in overrides, recorded in unmatched", () => {
    const pick = { shirt: "Imaginary Linen Shirt" };
    const { overrides, unmatched } = resolveGarmentSlots(pick, GARMENTS, SLOTS);
    expect(overrides).not.toHaveProperty("shirt");
    expect(unmatched).toEqual([{ slot: "shirt", name: "Imaginary Linen Shirt" }]);
  });

  it("partial unmatched: matched slots applied, unmatched listed", () => {
    const pick = { shirt: "Navy Polo", pants: "Imaginary Pants" };
    const { overrides, unmatched } = resolveGarmentSlots(pick, GARMENTS, SLOTS);
    expect(overrides.shirt).toBe("g1");
    expect(overrides).not.toHaveProperty("pants");
    expect(unmatched).toEqual([{ slot: "pants", name: "Imaginary Pants" }]);
  });
});

describe("resolveGarmentSlots — defensive input handling", () => {
  it("null pick → empty result, no throw", () => {
    expect(resolveGarmentSlots(null, GARMENTS, SLOTS)).toEqual({ overrides: {}, unmatched: [] });
  });

  it("non-array garments → empty result, no throw", () => {
    expect(resolveGarmentSlots({ shirt: "x" }, null, SLOTS)).toEqual({ overrides: {}, unmatched: [] });
  });

  it("non-array slots → empty result, no throw", () => {
    expect(resolveGarmentSlots({ shirt: "x" }, GARMENTS, null)).toEqual({ overrides: {}, unmatched: [] });
  });

  it("non-string slot value (number, object) is ignored", () => {
    const { overrides, unmatched } = resolveGarmentSlots({ shirt: 42, pants: {} }, GARMENTS, SLOTS);
    expect(overrides).toEqual({});
    expect(unmatched).toEqual([]);
  });

  it("garment with missing name is skipped (no crash)", () => {
    const garments = [{ id: "x" }, { id: "g1", name: "Navy Polo" }];
    const { overrides } = resolveGarmentSlots({ shirt: "Navy Polo" }, garments, SLOTS);
    expect(overrides.shirt).toBe("g1");
  });
});

// ── validateDifferentWatchPick ───────────────────────────────────────────────

const WATCHES = [
  { id: "blackbay", brand: "Tudor", model: "BB41" },
  { id: "speedmaster", brand: "Omega", model: "Speedmaster" },
  { id: "old_sinn", brand: "Sinn", model: "613 UTC", retired: true },
  { id: "fears", brand: "Fears", model: "Brunswick", pending: true },
];
const isActive = w => !w?.retired && !w?.pending;

describe("validateDifferentWatchPick", () => {
  it("matched + active → ok with watch", () => {
    const r = validateDifferentWatchPick("blackbay", WATCHES, isActive);
    expect(r.ok).toBe(true);
    expect(r.watch.id).toBe("blackbay");
  });

  it("watchId not in collection → not ok", () => {
    const r = validateDifferentWatchPick("hallucinated_id", WATCHES, isActive);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not in collection");
  });

  it("watchId references a retired watch → not ok", () => {
    const r = validateDifferentWatchPick("old_sinn", WATCHES, isActive);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/retired|pending/);
  });

  it("watchId references a pending (not yet arrived) watch → not ok", () => {
    const r = validateDifferentWatchPick("fears", WATCHES, isActive);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/retired|pending/);
  });

  it("missing watchId → not ok", () => {
    const r = validateDifferentWatchPick(null, WATCHES, isActive);
    expect(r.ok).toBe(false);
  });

  it("non-string watchId → not ok", () => {
    expect(validateDifferentWatchPick(42, WATCHES, isActive).ok).toBe(false);
    expect(validateDifferentWatchPick({}, WATCHES, isActive).ok).toBe(false);
  });

  it("non-array watches → not ok", () => {
    expect(validateDifferentWatchPick("blackbay", null, isActive).ok).toBe(false);
  });

  it("isActiveWatch param is optional (skips active check if not function)", () => {
    // When isActive is omitted, only collection presence is checked
    const r = validateDifferentWatchPick("blackbay", WATCHES);
    expect(r.ok).toBe(true);
  });
});
