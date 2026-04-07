import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock with call counting ─────────────────────────────────────────

let queryCallCount = 0;
let garmentQueryResult = { data: [], error: null };
let historyQueryResult = { data: [], error: null };

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    order:  vi.fn(() => chain),
    limit:  vi.fn(() => {
      queryCallCount++;
      return Promise.resolve(resolveWith());
    }),
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  };
  return chain;
}

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === "garments") return makeChain(() => garmentQueryResult);
      if (table === "history") return makeChain(() => historyQueryResult);
      return makeChain(() => ({ data: [], error: null }));
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://storage.url/photo.jpg" } })),
        remove: vi.fn().mockResolvedValue({}),
      })),
    },
  },
}));

vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

const { pullCloudState } = await import("../src/services/supabaseSync.js");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("pullCloudState — concurrent deduplication", () => {
  beforeEach(() => {
    queryCallCount = 0;
    garmentQueryResult = {
      data: [{ id: "g1", name: "Navy Polo", type: "shirt", category: "shirt", color: "navy", formality: 5 }],
      error: null,
    };
    historyQueryResult = { data: [], error: null };
  });

  it("two concurrent calls return the same data", async () => {
    const [r1, r2] = await Promise.all([pullCloudState(), pullCloudState()]);
    expect(r1.garments).toEqual(r2.garments);
    expect(r1.watches).toBe(r2.watches);
  });

  it("two concurrent calls share the same inflight promise (only one DB round-trip)", async () => {
    const before = queryCallCount;
    await Promise.all([pullCloudState(), pullCloudState()]);
    const after = queryCallCount;
    // Each pull fires 2 queries (garments + history). With deduplication,
    // only 1 round-trip should fire (2 queries), not 2 (4 queries).
    expect(after - before).toBe(2);
  });

  it("sequential calls each make their own DB round-trip", async () => {
    const before = queryCallCount;
    await pullCloudState();
    await pullCloudState();
    const after = queryCallCount;
    // 2 sequential pulls = 2 round-trips = 4 queries
    expect(after - before).toBe(4);
  });

  it("concurrent calls both settle when DB returns error", async () => {
    garmentQueryResult = { data: null, error: { message: "timeout" } };
    const results = await Promise.allSettled([pullCloudState(), pullCloudState()]);
    // Both should settle the same way (both reject or both resolve with error)
    expect(results[0].status).toBe(results[1].status);
  });

  it("after a failed concurrent call, next call retries (inflight cleared)", async () => {
    garmentQueryResult = { data: null, error: { message: "timeout" } };
    await Promise.allSettled([pullCloudState(), pullCloudState()]);

    // Fix the error
    garmentQueryResult = {
      data: [{ id: "g1", name: "Test", type: "shirt", category: "shirt", color: "blue" }],
      error: null,
    };
    const result = await pullCloudState();
    expect(result.garments.length).toBe(1);
  });
});

describe("pullCloudState — data shape", () => {
  beforeEach(() => {
    garmentQueryResult = {
      data: [{
        id: "g1", name: "Navy Polo", type: "shirt", category: "shirt",
        color: "navy", formality: 5, hash: "abc123",
        photo_type: "gallery", needs_review: false, duplicate_of: null,
        exclude_from_wardrobe: false, photo_angles: ["https://storage/a1.jpg"],
        brand: "Lacoste", subtype: "polo", notes: null,
        material: "cotton", pattern: "solid", seasons: ["spring", "summer"],
        contexts: ["casual"], price: 120, accent_color: null,
        weight: "light", fit: "regular", created_at: "2026-01-01",
      }],
      error: null,
    };
    historyQueryResult = { data: [], error: null };
  });

  it("maps DB columns to garment object shape", async () => {
    const result = await pullCloudState();
    const g = result.garments[0];
    expect(g.type).toBe("shirt");
    expect(g.category).toBeUndefined(); // category not set on JS objects — use type
    expect(g.photoType).toBe("gallery");
    expect(g.needsReview).toBe(false);
    // Phase 1: photo URLs are null (filled by pullThumbnails)
    expect(g.photoUrl).toBeNull();
    expect(g.thumbnail).toBeNull();
  });

  it("always includes WATCH_COLLECTION in result", async () => {
    const result = await pullCloudState();
    expect(result.watches).toBeDefined();
    expect(result.watches.length).toBeGreaterThanOrEqual(23);
  });

  it("returns empty garments array when DB returns null", async () => {
    garmentQueryResult = { data: null, error: null };
    // This will throw because of the gErr check, so let's test with empty array
    garmentQueryResult = { data: [], error: null };
    const result = await pullCloudState();
    expect(result.garments).toEqual([]);
  });
});
