import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Build chainable query mock ─────────────────────────────────────────────

let searchQueryResult = { data: [], error: null };
let rpcResult = { data: [], error: null };

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    or: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(resolveWith())),
  };
  return chain;
}

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn(() => makeChain(() => searchQueryResult)),
    rpc: vi.fn((...args) => Promise.resolve(rpcResult)),
  },
}));

// Force IS_PLACEHOLDER to be false
vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

const { fuzzySearchGarments, semanticSearchGarments } = await import("../src/services/supabaseSearch.js");

describe("fuzzySearchGarments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchQueryResult = { data: [], error: null };
  });

  it("returns empty array for empty string query", async () => {
    const results = await fuzzySearchGarments("");
    expect(results).toEqual([]);
  });

  it("returns empty array for null query", async () => {
    const results = await fuzzySearchGarments(null);
    expect(results).toEqual([]);
  });

  it("returns empty array for undefined query", async () => {
    const results = await fuzzySearchGarments(undefined);
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    const results = await fuzzySearchGarments("   ");
    expect(results).toEqual([]);
  });

  it("calls supabase with correct table for valid query", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    await fuzzySearchGarments("navy shirt");
    expect(supabase.from).toHaveBeenCalledWith("garments");
  });

  it("returns mapped results with thumbnail from photo_url", async () => {
    searchQueryResult = {
      data: [
        { id: "g1", name: "Navy Shirt", type: "shirt", color: "navy",
          photo_url: "https://x.com/photo.jpg", thumbnail_url: null, formality: 7, brand: "Zara" },
      ],
      error: null,
    };

    const results = await fuzzySearchGarments("navy");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("g1");
    expect(results[0].thumbnail).toBe("https://x.com/photo.jpg");
  });

  it("falls back thumbnail to thumbnail_url when photo_url is null", async () => {
    searchQueryResult = {
      data: [
        { id: "g1", name: "Test", photo_url: null, thumbnail_url: "https://x.com/thumb.jpg" },
      ],
      error: null,
    };

    const results = await fuzzySearchGarments("test");
    expect(results[0].thumbnail).toBe("https://x.com/thumb.jpg");
  });

  it("sets thumbnail to null when both photo_url and thumbnail_url are null", async () => {
    searchQueryResult = {
      data: [{ id: "g1", name: "Test", photo_url: null, thumbnail_url: null }],
      error: null,
    };

    const results = await fuzzySearchGarments("test");
    expect(results[0].thumbnail).toBeNull();
  });

  it("returns empty array on query error", async () => {
    searchQueryResult = { data: null, error: { message: "Query failed" } };
    const results = await fuzzySearchGarments("shirt");
    expect(results).toEqual([]);
  });

  it("returns empty array when data is null (no error)", async () => {
    searchQueryResult = { data: null, error: null };
    const results = await fuzzySearchGarments("pants");
    expect(results).toEqual([]);
  });
});

describe("semanticSearchGarments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcResult = { data: [], error: null };
  });

  it("returns empty array for empty embedding array", async () => {
    const results = await semanticSearchGarments([]);
    expect(results).toEqual([]);
  });

  it("returns empty array for null embedding", async () => {
    const results = await semanticSearchGarments(null);
    expect(results).toEqual([]);
  });

  it("calls match_garments RPC with correct params", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    const embedding = [0.1, 0.2, 0.3];
    await semanticSearchGarments(embedding, 5);
    expect(supabase.rpc).toHaveBeenCalledWith("match_garments", {
      query_embedding: embedding,
      match_count: 5,
    });
  });

  it("uses default limit of 10", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    await semanticSearchGarments([0.1]);
    expect(supabase.rpc).toHaveBeenCalledWith("match_garments", {
      query_embedding: [0.1],
      match_count: 10,
    });
  });

  it("maps results with similarity score", async () => {
    rpcResult = {
      data: [
        { id: "g1", name: "Navy Shirt", photo_url: "https://x.com/p.jpg",
          thumbnail_url: null, similarity: 0.92 },
      ],
      error: null,
    };

    const results = await semanticSearchGarments([0.1, 0.2]);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(0.92);
    expect(results[0].thumbnail).toBe("https://x.com/p.jpg");
  });

  it("returns empty array on RPC error", async () => {
    rpcResult = { data: null, error: { message: "RPC failed" } };
    const results = await semanticSearchGarments([0.1, 0.2]);
    expect(results).toEqual([]);
  });
});
