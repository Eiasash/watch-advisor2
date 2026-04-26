/**
 * Watch status filter tests.
 *
 * Centralised "is this watch eligible for rotation today?" predicates.
 * The collection mixes three lifecycle states encoded as flags on each
 * watch:
 *
 *   - retired:  traded away or sold; kept for history integrity but
 *               must never appear in the rotation, recommendation or
 *               selector lists.
 *   - pending:  acquired but not yet received in hand. Visible in the
 *               collection panel (so the user knows it's coming) but
 *               must be excluded from rotation until physical arrival.
 *   - genuine/replica/dualDial/etc: cosmetic, do not affect activeness.
 *
 * These predicates were the only remaining un-tested utility module;
 * a regression here would silently drift retired/pending watches back
 * into the day-pick list (a UX bug + handing the user a wrong watch).
 *
 * Also exercises the WATCH_COLLECTION sacred-seed invariant: at least
 * one retired and one pending entry exist in the seed, so the filters
 * actually have something to filter against in the production data set.
 */

import { describe, it, expect } from "vitest";
import {
  isActiveWatch,
  isSelectableWatch,
  activeWatches,
} from "../src/utils/watchFilters.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

describe("isActiveWatch — predicate", () => {
  it("returns true for a plain watch object (no flags)", () => {
    expect(isActiveWatch({ id: "w1", brand: "X", model: "Y" })).toBe(true);
  });

  it("returns false when retired:true", () => {
    expect(isActiveWatch({ id: "w1", retired: true })).toBe(false);
  });

  it("returns false when pending:true", () => {
    expect(isActiveWatch({ id: "w1", pending: true })).toBe(false);
  });

  it("returns false when both retired and pending are set", () => {
    // A retired-then-reacquired-but-not-yet-received watch shouldn't appear
    // in rotation either way.
    expect(isActiveWatch({ id: "w1", retired: true, pending: true })).toBe(false);
  });

  it("treats falsy retired/pending as not set (active)", () => {
    expect(isActiveWatch({ id: "w1", retired: false, pending: false })).toBe(true);
    expect(isActiveWatch({ id: "w1", retired: 0, pending: 0 })).toBe(true);
    expect(isActiveWatch({ id: "w1", retired: null, pending: undefined })).toBe(true);
  });

  it("returns false for null / undefined input (defensive)", () => {
    expect(isActiveWatch(null)).toBe(false);
    expect(isActiveWatch(undefined)).toBe(false);
  });

  it("ignores cosmetic flags — replica, dualDial, shiftWatch, genuine", () => {
    expect(isActiveWatch({ id: "w1", replica: true })).toBe(true);
    expect(isActiveWatch({ id: "w1", dualDial: { sideA: "navy" } })).toBe(true);
    expect(isActiveWatch({ id: "w1", shiftWatch: true })).toBe(true);
    expect(isActiveWatch({ id: "w1", genuine: true })).toBe(true);
  });
});

describe("isSelectableWatch — alias for isActiveWatch", () => {
  it("returns the same boolean as isActiveWatch for every input shape", () => {
    const cases = [
      { id: "w1" },
      { id: "w1", retired: true },
      { id: "w1", pending: true },
      null,
      undefined,
    ];
    for (const c of cases) {
      expect(isSelectableWatch(c)).toBe(isActiveWatch(c));
    }
  });
});

describe("activeWatches — array filter", () => {
  it("returns [] for null / undefined input", () => {
    expect(activeWatches(null)).toEqual([]);
    expect(activeWatches(undefined)).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(activeWatches([])).toEqual([]);
  });

  it("filters out retired and pending entries, preserves order", () => {
    const seed = [
      { id: "a" },
      { id: "b", retired: true },
      { id: "c" },
      { id: "d", pending: true },
      { id: "e" },
    ];
    const out = activeWatches(seed);
    expect(out.map((w) => w.id)).toEqual(["a", "c", "e"]);
  });

  it("preserves the original objects (no mutation, same references)", () => {
    const a = { id: "a" };
    const b = { id: "b", retired: true };
    const out = activeWatches([a, b]);
    expect(out[0]).toBe(a);
    expect(out).toHaveLength(1);
  });
});

describe("Production seed — WATCH_COLLECTION lifecycle invariants", () => {
  it("contains at least one retired entry (history integrity preserved)", () => {
    const retired = WATCH_COLLECTION.filter((w) => w.retired);
    expect(retired.length).toBeGreaterThanOrEqual(1);
  });

  it("contains at least one pending entry (lifecycle filter has something to filter)", () => {
    const pending = WATCH_COLLECTION.filter((w) => w.pending);
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });

  it("activeWatches(WATCH_COLLECTION) excludes every retired and pending entry", () => {
    const active = activeWatches(WATCH_COLLECTION);
    const activeIds = new Set(active.map((w) => w.id));
    for (const w of WATCH_COLLECTION) {
      if (w.retired || w.pending) {
        expect(activeIds.has(w.id), `${w.id} (retired=${!!w.retired},pending=${!!w.pending}) leaked into activeWatches`).toBe(false);
      }
    }
  });

  it("active count matches manual filter (no off-by-one)", () => {
    const active = activeWatches(WATCH_COLLECTION);
    const expected = WATCH_COLLECTION.filter((w) => !w.retired && !w.pending).length;
    expect(active.length).toBe(expected);
  });

  it("every active watch has the minimum schema fields needed by rotation (id/brand/model/formality)", () => {
    const active = activeWatches(WATCH_COLLECTION);
    const bad = active.filter(
      (w) =>
        typeof w.id !== "string" ||
        typeof w.brand !== "string" ||
        typeof w.model !== "string" ||
        typeof w.formality !== "number",
    );
    expect(bad.map((w) => w.id)).toEqual([]);
  });
});
