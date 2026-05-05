/**
 * tests/claudeStylistEdge.test.js
 *
 * Gap-filling tests for src/aiStylist/claudeStylist.js.
 * tests/claudeStylist.test.js covers happy path + filtering.
 * This file targets the error and edge-case paths IMPROVEMENTS.md flagged
 * as missing: non-JSON content-type, 4xx/5xx response codes, pinnedSlots
 * transformation, sweater slot in engineOutfit, network throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture-and-respond fetch mock — set per-test.
let fetchImpl = null;
let lastBody = null;

vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
  if (opts?.body) {
    try { lastBody = JSON.parse(opts.body); } catch { lastBody = null; }
  }
  return fetchImpl ? fetchImpl(url, opts) : { ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) };
}));

const { getAISuggestion } = await import("../src/aiStylist/claudeStylist.js");

const WATCH = { id: "w1", brand: "Tudor", model: "BB41", dial: "black", style: "sport", formality: 6, strap: "bracelet" };

beforeEach(() => {
  lastBody = null;
  fetchImpl = null;
});

// ── Response failure modes ───────────────────────────────────────────────────

describe("claudeStylist — response failure modes", () => {
  beforeEach(() => {
    // Reset global fetch on each test in case a prior test stubbed something different
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      if (opts?.body) try { lastBody = JSON.parse(opts.body); } catch { lastBody = null; }
      return fetchImpl ? fetchImpl(url, opts) : { ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) };
    }));
  });

  it("returns null on 4xx response", async () => {
    fetchImpl = () => ({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });

  it("returns null on 5xx response", async () => {
    fetchImpl = () => ({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });

  it("returns null when content-type is not JSON (HTML error page)", async () => {
    fetchImpl = () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => { throw new Error("not json"); },
    });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });

  it("returns null when content-type header is missing entirely", async () => {
    fetchImpl = () => ({
      ok: true,
      status: 200,
      headers: new Headers(), // no content-type
      json: async () => ({ shirt: null }),
    });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });

  it("accepts content-type with charset suffix (application/json; charset=utf-8)", async () => {
    fetchImpl = () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
      json: async () => ({ shirt: { name: "x" } }),
    });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toEqual({ shirt: { name: "x" } });
  });

  it("returns null when fetch itself throws synchronously", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("CORS blocked"); }));
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });

  it("returns null when res.json() itself rejects (malformed JSON body)", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => { throw new SyntaxError("Unexpected token"); },
    });
    const r = await getAISuggestion([], WATCH, null, {});
    expect(r).toBeNull();
  });
});

// ── pinnedSlots transformation ───────────────────────────────────────────────

describe("claudeStylist — pinnedSlots transformation", () => {
  it("transforms each pinned slot to {name,type,color} only", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    const pinnedSlots = {
      shirt: { id: "g1", name: "Navy Oxford", type: "shirt", color: "navy", formality: 6, thumbnail: "data:abc", hash: "xyz" },
      pants: { id: "g2", name: "Khaki Chinos", type: "pants", color: "khaki", formality: 5 },
    };
    await getAISuggestion([], WATCH, null, {}, "smart-casual", pinnedSlots);

    expect(lastBody.pinnedSlots.shirt).toEqual({ name: "Navy Oxford", type: "shirt", color: "navy" });
    expect(lastBody.pinnedSlots.shirt).not.toHaveProperty("formality");
    expect(lastBody.pinnedSlots.shirt).not.toHaveProperty("id");
    expect(lastBody.pinnedSlots.shirt).not.toHaveProperty("thumbnail");

    expect(lastBody.pinnedSlots.pants).toEqual({ name: "Khaki Chinos", type: "pants", color: "khaki" });
  });

  it("preserves null pin slots as null (not omitted)", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    const pinnedSlots = { shirt: null, pants: { name: "Pants", type: "pants", color: "navy" }, shoes: null };
    await getAISuggestion([], WATCH, null, {}, "smart-casual", pinnedSlots);

    expect(lastBody.pinnedSlots).toHaveProperty("shirt", null);
    expect(lastBody.pinnedSlots).toHaveProperty("shoes", null);
    expect(lastBody.pinnedSlots.pants).toEqual({ name: "Pants", type: "pants", color: "navy" });
  });

  it("defaults pinnedSlots to empty object when not provided", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    await getAISuggestion([], WATCH, null, {}); // no pinnedSlots arg
    expect(lastBody.pinnedSlots).toEqual({});
  });
});

// ── engineOutfit completeness — sweater + jacket slots ───────────────────────

describe("claudeStylist — engineOutfit slot coverage", () => {
  it("transforms sweater slot (gap not covered by base test)", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    await getAISuggestion([], WATCH, null, {
      sweater: { id: "s1", name: "Black Cable Knit", type: "sweater", color: "black", formality: 5, thumbnail: "data:x" },
    });
    expect(lastBody.engineOutfit.sweater).toEqual({ name: "Black Cable Knit", type: "sweater", color: "black" });
    expect(lastBody.engineOutfit.sweater).not.toHaveProperty("formality");
  });

  it("transforms jacket slot", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    await getAISuggestion([], WATCH, null, {
      jacket: { name: "Camel Coat", type: "jacket", color: "camel" },
    });
    expect(lastBody.engineOutfit.jacket).toEqual({ name: "Camel Coat", type: "jacket", color: "camel" });
  });

  it("all five engineOutfit slots default to null when missing", async () => {
    fetchImpl = () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    await getAISuggestion([], WATCH, null, {});
    expect(lastBody.engineOutfit).toEqual({
      shirt: null, sweater: null, pants: null, shoes: null, jacket: null,
    });
  });
});
