import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch to capture what getAISuggestion sends
let lastFetchBody = null;
global.fetch = vi.fn(async (url, opts) => {
  lastFetchBody = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ shirt: null, pants: null, shoes: null, jacket: null, explanation: "test" }) };
});

const { getAISuggestion } = await import("../src/aiStylist/claudeStylist.js");

describe("claudeStylist garment filtering", () => {
  beforeEach(() => {
    lastFetchBody = null;
    vi.clearAllMocks();
  });

  const WATCH = { id: "w1", brand: "Omega", model: "Speedmaster", dial: "black", style: "sport", formality: 6, strap: "bracelet" };

  it("filters out outfit-photo type garments", async () => {
    const garments = [
      { id: "g1", type: "shirt", color: "white", name: "White Shirt", formality: 5 },
      { id: "g2", type: "outfit-photo", color: "unknown", name: "Selfie", formality: 5 },
      { id: "g3", type: "pants", color: "navy", name: "Navy Pants", formality: 6 },
    ];
    await getAISuggestion(garments, WATCH, null, {});
    const types = lastFetchBody.garments.map(g => g.type);
    expect(types).not.toContain("outfit-photo");
    expect(types).toContain("shirt");
    expect(types).toContain("pants");
  });

  it("filters out outfit-shot type garments", async () => {
    const garments = [
      { id: "g1", type: "shirt", color: "white", name: "Shirt", formality: 5 },
      { id: "g2", type: "outfit-shot", color: "unknown", name: "OOTD", formality: 5 },
    ];
    await getAISuggestion(garments, WATCH, null, {});
    const types = lastFetchBody.garments.map(g => g.type);
    expect(types).not.toContain("outfit-shot");
  });

  it("maps garment.category to type when type is missing", async () => {
    const garments = [
      { id: "g1", category: "shirt", color: "navy", name: "Navy Shirt", formality: 5 },
    ];
    await getAISuggestion(garments, WATCH, null, {});
    expect(lastFetchBody.garments[0].type).toBe("shirt");
  });

  it("sends only name, type, color, formality per garment", async () => {
    const garments = [
      { id: "g1", type: "shoes", color: "black", name: "Black Derby", formality: 8,
        thumbnail: "data:abc", hash: "12345", photoUrl: "blob:x" },
    ];
    await getAISuggestion(garments, WATCH, null, {});
    const sent = lastFetchBody.garments[0];
    expect(Object.keys(sent).sort()).toEqual(["color", "formality", "name", "type"]);
  });

  it("sends engineOutfit with only name/type/color", async () => {
    const garments = [{ id: "g1", type: "shirt", color: "white", name: "Shirt", formality: 5 }];
    const outfit = {
      shirt: { id: "g1", name: "White Oxford", type: "shirt", color: "white", thumbnail: "data:abc", formality: 5 },
    };
    await getAISuggestion(garments, WATCH, null, outfit);
    const eo = lastFetchBody.engineOutfit;
    expect(eo.shirt).toEqual({ name: "White Oxford", type: "shirt", color: "white" });
    expect(eo.shirt).not.toHaveProperty("thumbnail");
    expect(eo.shirt).not.toHaveProperty("formality");
  });

  it("sends null for empty outfit slots", async () => {
    await getAISuggestion([{ id: "g1", type: "shirt", color: "white", name: "S", formality: 5 }], WATCH, null, {});
    const eo = lastFetchBody.engineOutfit;
    expect(eo.shirt).toBeNull();
    expect(eo.pants).toBeNull();
    expect(eo.shoes).toBeNull();
    expect(eo.jacket).toBeNull();
  });

  it("passes dayProfile to the request", async () => {
    await getAISuggestion([], WATCH, null, {}, "hospital-smart-casual");
    expect(lastFetchBody.dayProfile).toBe("hospital-smart-casual");
  });

  it("defaults dayProfile to smart-casual", async () => {
    await getAISuggestion([], WATCH, null, {});
    expect(lastFetchBody.dayProfile).toBe("smart-casual");
  });

  it("returns null on fetch error", async () => {
    global.fetch = vi.fn(() => { throw new Error("Network error"); });
    const result = await getAISuggestion([], WATCH, null, {});
    expect(result).toBeNull();
    // Restore
    global.fetch = vi.fn(async (url, opts) => {
      lastFetchBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });
  });
});
