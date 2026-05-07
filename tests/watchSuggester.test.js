import { describe, it, expect } from "vitest";
import { suggestWatchForOutfit } from "../src/outfitEngine/watchSuggester.js";

/**
 * Reverse-engine suggestion contract (v1.13.12).
 *
 * The forward engine takes a watch + ranks garments. This module flips
 * it: given a chosen outfit, rank watches by best harmony.
 *
 * Tests below pin three properties:
 *   1. Empty/insufficient input → empty list (not a crash)
 *   2. excludeFromWardrobe + retired/pending watches → excluded
 *   3. Higher-formality outfit → higher-formality watch wins
 *
 * Score values themselves aren't asserted — they depend on the underlying
 * scoring functions which evolve. Order is the contract.
 */

const browns = (id, formality, dial = "white") => ({
  id, brand: "Test", model: id,
  dial, style: "dress", formality, replica: false, straps: ["leather"],
});

const garm = (id, type, color, formality) => ({
  id, name: id, type, color, formality, brand: "T", material: "cotton",
});

describe("suggestWatchForOutfit", () => {
  it("returns empty list when no garments chosen", () => {
    const watches = [browns("dressy", 9), browns("casual", 4)];
    expect(suggestWatchForOutfit(watches, {}).length).toBe(0);
    expect(suggestWatchForOutfit(watches, { shirt: null, pants: null })).toEqual([]);
  });

  it("returns empty list when watches array is empty", () => {
    expect(suggestWatchForOutfit([], { shirt: garm("a", "shirt", "white", 7) })).toEqual([]);
  });

  it("excludes excludeFromWardrobe watches by default", () => {
    const w1 = { ...browns("ok", 7), excludeFromWardrobe: false };
    const w2 = { ...browns("excluded", 7), excludeFromWardrobe: true };
    const out = { shirt: garm("s", "shirt", "white", 7) };
    const result = suggestWatchForOutfit([w1, w2], out);
    expect(result.find(r => r.watch.id === "excluded")).toBeUndefined();
    expect(result.find(r => r.watch.id === "ok")).toBeDefined();
  });

  it("excludes pending and retired watches", () => {
    const ok = browns("active", 7);
    const pending = { ...browns("pending", 7), pending: true };
    const retired = { ...browns("retired", 7), retired: true };
    const out = { shirt: garm("s", "shirt", "white", 7) };
    const result = suggestWatchForOutfit([ok, pending, retired], out);
    expect(result.length).toBe(1);
    expect(result[0].watch.id).toBe("active");
  });

  it("returns inactive watches when includeInactive: true", () => {
    const ok = browns("active", 7);
    const retired = { ...browns("retired", 7), retired: true };
    const result = suggestWatchForOutfit(
      [ok, retired],
      { shirt: garm("s", "shirt", "white", 7) },
      { includeInactive: true },
    );
    expect(result.length).toBe(2);
  });

  it("respects limit option", () => {
    const watches = Array.from({ length: 10 }, (_, i) => browns(`w${i}`, 5));
    const out = { shirt: garm("s", "shirt", "white", 5) };
    expect(suggestWatchForOutfit(watches, out, { limit: 3 }).length).toBe(3);
    expect(suggestWatchForOutfit(watches, out, { limit: 10 }).length).toBe(10);
  });

  it("sorts by score descending", () => {
    const dressy = browns("dressy", 9);
    const sport = browns("sport", 3);
    const formalOutfit = {
      shirt: garm("s", "shirt", "white", 9),
      pants: garm("p", "pants", "black", 9),
      shoes: garm("sh", "shoes", "black", 9),
    };
    const result = suggestWatchForOutfit([sport, dressy], formalOutfit);
    expect(result.length).toBe(2);
    // Dressy should outscore sport for a formal outfit
    expect(result[0].watch.id).toBe("dressy");
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("each result has shape { watch, score, reasons }", () => {
    const watches = [browns("w1", 6)];
    const out = { shoes: garm("sh", "shoes", "brown", 6) };
    const r = suggestWatchForOutfit(watches, out)[0];
    expect(r.watch).toBeDefined();
    expect(typeof r.score).toBe("number");
    expect(Array.isArray(r.reasons)).toBe(true);
  });

  it("score is a finite number even on degenerate input", () => {
    const watches = [browns("w1", 5)];
    const out = { shirt: { id: "g", type: "shirt" } }; // no color, no formality
    const r = suggestWatchForOutfit(watches, out);
    expect(r.length).toBe(1);
    expect(Number.isFinite(r[0].score)).toBe(true);
  });
});

/**
 * Regression suite: use the *actual* watchSeed.js data shape, not synthetic
 * fixtures. Catches divergence where the engine filter uses one field name
 * but the seed uses another (the bug fixed in v1.13.17 — `w.status` vs
 * `w.retired`/`w.pending`). Mirrors the dayProfile.js filter contract.
 */
describe("suggestWatchForOutfit — real seed shape", () => {
  it("filters retired watches (boolean field, not status string)", async () => {
    const { WATCH_COLLECTION } = await import("../src/data/watchSeed.js");
    const retiredCount = WATCH_COLLECTION.filter(w => w.retired === true).length;
    expect(retiredCount).toBeGreaterThan(0); // guard against seed drift hiding the test

    const out = { shirt: garm("s", "shirt", "white", 7) };
    const result = suggestWatchForOutfit(WATCH_COLLECTION, out);
    const retiredInResults = result.filter(r => r.watch.retired === true);
    expect(retiredInResults).toEqual([]); // no retired watches ever surface
  });

  it("filters pending watches (boolean field, not status string)", async () => {
    const { WATCH_COLLECTION } = await import("../src/data/watchSeed.js");
    const pendingCount = WATCH_COLLECTION.filter(w => w.pending === true).length;
    expect(pendingCount).toBeGreaterThan(0); // guard against seed drift hiding the test

    const out = { shirt: garm("s", "shirt", "white", 7) };
    const result = suggestWatchForOutfit(WATCH_COLLECTION, out);
    const pendingInResults = result.filter(r => r.watch.pending === true);
    expect(pendingInResults).toEqual([]);
  });
});
