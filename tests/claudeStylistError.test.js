import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const WATCH = { id: "w1", brand: "Omega", model: "Speedmaster", dial: "black", style: "sport", formality: 6, strap: "bracelet" };
const GARMENTS = [{ id: "g1", type: "shirt", color: "white", name: "Shirt", formality: 5 }];

// Save original fetch
const originalFetch = global.fetch;

describe("claudeStylist — error handling", () => {
  let getAISuggestion;

  beforeEach(async () => {
    vi.resetModules();
    // Default: successful fetch
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ explanation: "test" }),
    }));
    const mod = await import("../src/aiStylist/claudeStylist.js");
    getAISuggestion = mod.getAISuggestion;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns null when fetch throws network error", async () => {
    global.fetch = vi.fn(() => { throw new Error("Failed to fetch"); });
    const result = await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(result).toBeNull();
  });

  it("returns null when response is not ok (500)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    const result = await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(result).toBeNull();
  });

  it("returns null when response is not ok (403)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 403 }));
    const result = await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(result).toBeNull();
  });

  it("returns null when json() throws", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => { throw new Error("Invalid JSON"); },
    }));
    const result = await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(result).toBeNull();
  });

  it("returns valid response on success", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ shirt: "White Shirt", explanation: "Looks good" }),
    }));
    const result = await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(result).toEqual({ shirt: "White Shirt", explanation: "Looks good" });
  });

  it("sends correct URL", async () => {
    await getAISuggestion(GARMENTS, WATCH, null, {});
    expect(global.fetch).toHaveBeenCalledWith(
      "/.netlify/functions/claude-stylist",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends Content-Type header", async () => {
    await getAISuggestion(GARMENTS, WATCH, null, {});
    const callArgs = global.fetch.mock.calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBe("application/json");
  });
});
