import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Build chainable query mock ─────────────────────────────────────────────

let garmentQueryResult = { data: [], error: null };
let historyQueryResult = { data: [], error: null };
let upsertCalls = [];

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(resolveWith())),
    upsert: vi.fn((...args) => {
      upsertCalls.push(args);
      return Promise.resolve({ error: null });
    }),
    delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  };
  return chain;
}

let callCount = 0;

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === "garments") {
        return makeChain(() => garmentQueryResult);
      }
      if (table === "history") {
        return makeChain(() => historyQueryResult);
      }
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

// Force IS_PLACEHOLDER to be false
vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

// Must import AFTER mocks are set up
const mod = await import("../src/services/supabaseSync.js");
const { pullCloudState, pushGarment, pushHistoryEntry } = mod;

describe("pullCloudState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
  });

  it("maps DB type/category columns to garment.type", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Navy shirt", type: "shirt", category: "shirt", color: "navy",
          formality: 7, hash: "abc", photo_url: "https://x.com/photo.jpg",
          thumbnail_url: "https://x.com/thumb.jpg", photo_type: "garment",
          needs_review: false, duplicate_of: null, photo_angles: [], brand: null, notes: null, created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].type).toBe("shirt");
    expect(result.garments[0].category).toBe("shirt");
  });

  it("filters blob: URLs from photoUrl", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Test", type: "shirt", category: "shirt", color: "navy",
          photo_url: "blob:http://localhost/12345", thumbnail_url: "data:image/jpeg;base64,abc",
          photo_type: "garment", needs_review: false, photo_angles: [], created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].photoUrl).toBeUndefined();
    // thumbnail also filters blob: URLs — falls back to thumbnail_url
    expect(result.garments[0].thumbnail).toBe("data:image/jpeg;base64,abc");
  });

  it("maps history rows with payload unpacking", async () => {
    garmentQueryResult = { data: [], error: null };
    historyQueryResult = {
      data: [
        { id: "h1", watch_id: "snowflake", date: "2026-03-07",
          payload: { outfit: { shirt: "s1" }, garmentIds: ["s1"], strapId: "strap1",
            strapLabel: "Black Leather", context: "hospital", notes: "test", loggedAt: "2026-03-07T10:00:00" } },
      ],
      error: null,
    };

    const result = await pullCloudState();
    expect(result.history[0].watchId).toBe("snowflake");
    expect(result.history[0].outfit).toEqual({ shirt: "s1" });
    expect(result.history[0].strapId).toBe("strap1");
    expect(result.history[0].strapLabel).toBe("Black Leather");
    expect(result.history[0].context).toBe("hospital");
  });

  it("returns _localOnly on garment error", async () => {
    garmentQueryResult = { data: null, error: { message: "Network error" } };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result._localOnly).toBe(true);
    expect(result.garments).toEqual([]);
  });

  it("maps exclude_from_wardrobe to excludeFromWardrobe", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Outfit selfie", type: "outfit-photo", category: "outfit-photo", color: null,
          photo_url: null, thumbnail_url: null, photo_type: "outfit-shot",
          needs_review: false, exclude_from_wardrobe: true, photo_angles: [], created_at: "2026-01-01" },
        { id: "g2", name: "Navy shirt", type: "shirt", category: "shirt", color: "navy",
          photo_url: null, thumbnail_url: null, photo_type: "garment",
          needs_review: false, exclude_from_wardrobe: false, photo_angles: [], created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].excludeFromWardrobe).toBe(true);
    expect(result.garments[1].excludeFromWardrobe).toBe(false);
  });

  it("defaults excludeFromWardrobe to false when column missing", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Shirt", type: "shirt", category: "shirt", color: "navy",
          photo_url: null, thumbnail_url: null, photo_type: "garment",
          needs_review: false, photo_angles: [], created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].excludeFromWardrobe).toBe(false);
  });

  it("handles null data arrays gracefully", async () => {
    garmentQueryResult = { data: null, error: null };
    historyQueryResult = { data: null, error: null };

    const result = await pullCloudState();
    expect(result.garments).toEqual([]);
    expect(result.history).toEqual([]);
  });
});

describe("pushGarment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
  });

  it("maps garment.type to DB type and category columns", async () => {
    await pushGarment({
      id: "g1", name: "Test", type: "shirt", color: "navy",
      formality: 7, hash: "abc", photoUrl: null, thumbnail: "data:abc",
    });

    expect(upsertCalls.length).toBe(1);
    const row = upsertCalls[0][0];
    expect(row.type).toBe("shirt");
    expect(row.category).toBe("shirt");
  });

  it("filters blob: URLs from photo_url", async () => {
    await pushGarment({
      id: "g1", name: "Test", type: "shirt",
      photoUrl: "blob:http://localhost/123",
      thumbnail: "data:image/jpeg;base64,abc",
    });

    const row = upsertCalls[0][0];
    expect(row.photo_url).toBeNull();
  });

  it("stores valid Storage URL in photo_url", async () => {
    await pushGarment({
      id: "g1", name: "Test", type: "shirt",
      photoUrl: "https://storage.supabase.co/photo.jpg",
      thumbnail: "data:abc",
    });

    const row = upsertCalls[0][0];
    expect(row.photo_url).toBe("https://storage.supabase.co/photo.jpg");
    expect(row.thumbnail_url).toBeNull(); // null because valid photo_url takes precedence
  });

  it("persists excludeFromWardrobe as exclude_from_wardrobe", async () => {
    await pushGarment({
      id: "g1", name: "Outfit selfie", type: "outfit-photo", color: null,
      excludeFromWardrobe: true, photoType: "outfit-shot",
    });

    const row = upsertCalls[0][0];
    expect(row.exclude_from_wardrobe).toBe(true);
  });

  it("defaults exclude_from_wardrobe to false when excludeFromWardrobe absent", async () => {
    await pushGarment({
      id: "g1", name: "Shirt", type: "shirt", color: "navy",
    });

    const row = upsertCalls[0][0];
    expect(row.exclude_from_wardrobe).toBe(false);
  });

  it("filters data: URLs from photo_angles", async () => {
    await pushGarment({
      id: "g1", name: "Test", type: "shirt",
      photoAngles: [
        "data:image/jpeg;base64,abc",
        "https://storage.supabase.co/angle.jpg",
      ],
    });

    const row = upsertCalls[0][0];
    expect(row.photo_angles).toEqual(["https://storage.supabase.co/angle.jpg"]);
  });
});

describe("pushHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
  });

  it("maps entry fields to DB schema with payload wrapper", async () => {
    await pushHistoryEntry({
      id: "h1",
      watchId: "snowflake",
      date: "2026-03-07",
      outfit: { shirt: "s1" },
      garmentIds: ["s1"],
      strapId: "strap1",
    });

    expect(upsertCalls.length).toBe(1);
    const row = upsertCalls[0][0];
    expect(row.id).toBe("h1");
    expect(row.watch_id).toBe("snowflake");
    expect(row.date).toBe("2026-03-07");
    expect(row.payload.outfit).toEqual({ shirt: "s1" });
    expect(row.payload.garmentIds).toEqual(["s1"]);
    expect(row.payload.strapId).toBe("strap1");
  });
});
