/**
 * Unit tests for categorizeGarments() in netlify/functions/daily-pick.js.
 *
 * The function takes the user's wardrobe + 14-day history and emits four
 * lists used to enrich the AI prompt:
 *   - newlyAdded   — uploaded recently AND no history record
 *   - neverWorn    — older garments with no history record
 *   - underWorn    — 0–2 wears in window
 *   - overRotated  — 5+ wears in window
 *
 * These are the personalization signals that drive the "try the new linen
 * shirt instead of the same OCBD again" behavior the user explicitly asked
 * for. Tests cover boundary conditions, ordering, and cap behavior.
 */
import { describe, test, expect } from "vitest";
import { categorizeGarments } from "../netlify/functions/daily-pick.js";

const DAY = 86400000;
const NOW = Date.now();

function g(id, opts = {}) {
  return {
    id,
    name: opts.name ?? id,
    type: opts.type ?? "shirt",
    color: opts.color ?? "blue",
    formality: opts.formality ?? 5,
    created_at: opts.created_at ?? new Date(NOW - 365 * DAY).toISOString(),
    ...opts,
  };
}

function wear(garmentIds, daysAgo = 1) {
  return {
    date: new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10),
    payload: { garmentIds },
  };
}

describe("categorizeGarments", () => {
  test("empty wardrobe + empty history → empty categories", () => {
    const r = categorizeGarments([], []);
    expect(r.newlyAdded).toEqual([]);
    expect(r.neverWorn).toEqual([]);
    expect(r.underWorn).toEqual([]);
    expect(r.overRotated).toEqual([]);
  });

  test("garment uploaded 5 days ago, never worn → newlyAdded", () => {
    const fresh = g("new1", { created_at: new Date(NOW - 5 * DAY).toISOString() });
    const r = categorizeGarments([fresh], []);
    expect(r.newlyAdded.map(x => x.id)).toEqual(["new1"]);
    expect(r.neverWorn).toEqual([]);
  });

  test("garment uploaded 60 days ago, never worn → neverWorn (not newlyAdded)", () => {
    const old = g("old1", { created_at: new Date(NOW - 60 * DAY).toISOString() });
    const r = categorizeGarments([old], []);
    expect(r.neverWorn.map(x => x.id)).toEqual(["old1"]);
    expect(r.newlyAdded).toEqual([]);
  });

  test("garment uploaded 5 days ago AND worn once → underWorn (not newlyAdded)", () => {
    // newlyAdded requires 0 wears — a single wear means it's been tried
    const fresh = g("fresh1", { created_at: new Date(NOW - 5 * DAY).toISOString() });
    const r = categorizeGarments([fresh], [wear(["fresh1"], 2)]);
    expect(r.newlyAdded).toEqual([]);
    expect(r.underWorn.map(x => x.id)).toEqual(["fresh1"]);
    expect(r.underWorn[0]._wc).toBe(1);
  });

  test("0–2 wears in window → underWorn; 5+ wears → overRotated", () => {
    const garments = [
      g("u1"), g("u2"), g("o1"), g("o2"),
    ];
    const history = [
      wear(["u1"], 1),                                   // u1 = 1 wear
      wear(["u2", "u2"], 2),                             // u2 = 2 wears (split)
      wear(["o1", "o1", "o1", "o1", "o1"], 1),           // o1 = 5 wears
      wear(["o2", "o2", "o2", "o2", "o2", "o2"], 3),     // o2 = 6 wears
    ];
    const r = categorizeGarments(garments, history);
    expect(r.underWorn.map(x => x.id).sort()).toEqual(["u1", "u2"]);
    expect(r.overRotated.map(x => x.id).sort()).toEqual(["o1", "o2"]);
  });

  test("3-4 wears in window → neither underWorn nor overRotated (well-rotated, omitted)", () => {
    const w = g("mid", { created_at: new Date(NOW - 200 * DAY).toISOString() });
    const history = [
      wear(["mid"], 1), wear(["mid"], 2), wear(["mid"], 3), wear(["mid"], 4),
    ];
    const r = categorizeGarments([w], history);
    expect(r.underWorn).toEqual([]);
    expect(r.overRotated).toEqual([]);
    expect(r.newlyAdded).toEqual([]);
    expect(r.neverWorn).toEqual([]);
  });

  test("newlyAdded sorted freshest first", () => {
    const garments = [
      g("a", { created_at: new Date(NOW - 20 * DAY).toISOString() }),
      g("b", { created_at: new Date(NOW - 5 * DAY).toISOString() }),
      g("c", { created_at: new Date(NOW - 10 * DAY).toISOString() }),
    ];
    const r = categorizeGarments(garments, []);
    expect(r.newlyAdded.map(x => x.id)).toEqual(["b", "c", "a"]);
  });

  test("overRotated sorted by wear count, descending", () => {
    const garments = [g("a"), g("b"), g("c")];
    const history = [
      wear(["a", "a", "a", "a", "a"], 1),                          // 5
      wear(["b", "b", "b", "b", "b", "b", "b", "b"], 1),           // 8
      wear(["c", "c", "c", "c", "c", "c"], 1),                      // 6
    ];
    const r = categorizeGarments(garments, history);
    expect(r.overRotated.map(x => x.id)).toEqual(["b", "c", "a"]);
  });

  test("cap option limits each category", () => {
    const garments = Array.from({ length: 20 }, (_, i) =>
      g(`new${i}`, { created_at: new Date(NOW - 5 * DAY).toISOString() })
    );
    const r = categorizeGarments(garments, [], { cap: 3 });
    expect(r.newlyAdded.length).toBe(3);
  });

  test("custom newDays threshold", () => {
    const fresh = g("fresh", { created_at: new Date(NOW - 14 * DAY).toISOString() });
    // default newDays=30 → fresh
    expect(categorizeGarments([fresh], []).newlyAdded.map(x => x.id)).toEqual(["fresh"]);
    // newDays=7 → not fresh anymore, falls to neverWorn
    expect(categorizeGarments([fresh], [], { newDays: 7 }).newlyAdded).toEqual([]);
    expect(categorizeGarments([fresh], [], { newDays: 7 }).neverWorn.map(x => x.id)).toEqual(["fresh"]);
  });

  test("garment with no created_at → treated as not new (never falls into newlyAdded)", () => {
    const noDate = g("nodate", { created_at: null });
    const r = categorizeGarments([noDate], []);
    expect(r.newlyAdded).toEqual([]);
    expect(r.neverWorn.map(x => x.id)).toEqual(["nodate"]);
  });

  test("history without payload.garmentIds → safe (counts as 0 wears)", () => {
    const w = g("x");
    const history = [
      { date: "2026-05-01", payload: null },
      { date: "2026-05-02", payload: { garmentIds: null } },
      { date: "2026-05-03" }, // no payload
    ];
    const r = categorizeGarments([w], history);
    expect(r.neverWorn.map(x => x.id)).toEqual(["x"]);
  });

  test("returned wearCount Map matches reality", () => {
    const garments = [g("a"), g("b")];
    const history = [
      wear(["a", "b"], 1),
      wear(["a"], 2),
    ];
    const r = categorizeGarments(garments, history);
    expect(r.wearCount.get("a")).toBe(2);
    expect(r.wearCount.get("b")).toBe(1);
  });

  test("over-rotated entries carry _wc count for prompt rendering", () => {
    const w = g("x");
    const history = Array.from({ length: 7 }, () => wear(["x"], 1));
    const r = categorizeGarments([w], history);
    expect(r.overRotated[0]._wc).toBe(7);
  });
});
