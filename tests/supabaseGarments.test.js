import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Build chainable query mock ─────────────────────────────────────────────

let garmentQueryResult = { data: [], error: null };
let historyQueryResult = { data: [], error: null };
let upsertCalls = [];
let deleteCalls = [];

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    not: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    or: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(resolveWith())),
    upsert: vi.fn((...args) => {
      upsertCalls.push(args);
      return Promise.resolve({ error: null });
    }),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    delete: vi.fn(() => ({
      eq: vi.fn((...args) => {
        deleteCalls.push(args);
        return Promise.resolve({ error: null });
      }),
    })),
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
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

// Force IS_PLACEHOLDER to be false
vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

// Must import AFTER mocks are set up
const {
  pullCloudState,
  pushGarment,
  deleteGarment,
  pushHistoryEntry,
  deleteHistoryEntry,
} = await import("../src/services/supabaseGarments.js");

describe("pullCloudState — garment fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
    deleteCalls = [];
  });

  it("returns garments array from Supabase data", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Navy Shirt", type: "shirt", category: "shirt", color: "navy",
          formality: 7, hash: "abc", photo_type: "garment", needs_review: false,
          photo_angles: [], created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments).toHaveLength(1);
    expect(result.garments[0].id).toBe("g1");
    expect(result.garments[0].name).toBe("Navy Shirt");
  });

  it("maps type column and removes category from JS objects", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Test", type: "shirt", category: "shirt", color: "white",
          created_at: "2026-01-01", photo_angles: [] },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].type).toBe("shirt");
    expect(result.garments[0].category).toBeUndefined();
  });

  it("falls back type from category when type is null", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Test", type: null, category: "pants", color: "black",
          created_at: "2026-01-01", photo_angles: [] },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].type).toBe("pants");
  });

  it("maps DB snake_case to JS camelCase fields", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Test", type: "jacket", category: "jacket", color: "navy",
          photo_type: "garment", needs_review: true, duplicate_of: "g0",
          exclude_from_wardrobe: true, photo_angles: ["https://x.com/a.jpg"],
          accent_color: "red", subtype: "blazer", material: "wool",
          pattern: "solid", seasons: ["winter"], contexts: ["formal"],
          price: 200, weight: "heavy", fit: "slim",
          created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    const g = result.garments[0];
    expect(g.photoType).toBe("garment");
    expect(g.needsReview).toBe(true);
    expect(g.duplicateOf).toBe("g0");
    expect(g.excludeFromWardrobe).toBe(true);
    expect(g.photoAngles).toEqual(["https://x.com/a.jpg"]);
    expect(g.accentColor).toBe("red");
    expect(g.subtype).toBe("blazer");
    expect(g.material).toBe("wool");
    expect(g.pattern).toBe("solid");
    expect(g.seasons).toEqual(["winter"]);
    expect(g.contexts).toEqual(["formal"]);
    expect(g.price).toBe(200);
    expect(g.weight).toBe("heavy");
    expect(g.fit).toBe("slim");
  });

  it("sets photoUrl and thumbnail to null in Phase 1 pull", async () => {
    garmentQueryResult = {
      data: [
        { id: "g1", name: "Test", type: "shirt", category: "shirt", color: "navy",
          photo_type: "garment", needs_review: false, photo_angles: [],
          created_at: "2026-01-01" },
      ],
      error: null,
    };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result.garments[0].photoUrl).toBeNull();
    expect(result.garments[0].thumbnail).toBeNull();
  });

  it("returns _localOnly on garment query error", async () => {
    garmentQueryResult = { data: null, error: { message: "DB error" } };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(result._localOnly).toBe(true);
    expect(result.garments).toEqual([]);
  });

  it("returns _localOnly on history query error", async () => {
    garmentQueryResult = { data: [], error: null };
    historyQueryResult = { data: null, error: { message: "History error" } };

    const result = await pullCloudState();
    expect(result._localOnly).toBe(true);
    expect(result.history).toEqual([]);
  });

  it("always includes watches from WATCH_COLLECTION", async () => {
    garmentQueryResult = { data: [], error: null };
    historyQueryResult = { data: [], error: null };

    const result = await pullCloudState();
    expect(Array.isArray(result.watches)).toBe(true);
    expect(result.watches.length).toBeGreaterThan(0);
  });
});

describe("pushGarment — type/category mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
  });

  it("maps garment.type to both type and category columns", async () => {
    await pushGarment({ id: "g1", name: "Test", type: "pants", color: "black" });
    const row = upsertCalls[0][0];
    expect(row.type).toBe("pants");
    expect(row.category).toBe("pants");
  });

  it("defaults formality to 5 when absent", async () => {
    await pushGarment({ id: "g1", name: "Test", type: "shirt", color: "white" });
    const row = upsertCalls[0][0];
    expect(row.formality).toBe(5);
  });

  it("preserves provided formality value", async () => {
    await pushGarment({ id: "g1", name: "Test", type: "shirt", color: "white", formality: 8 });
    const row = upsertCalls[0][0];
    expect(row.formality).toBe(8);
  });

  it("writes null for photo_url when photoUrl is blob:", async () => {
    await pushGarment({ id: "g1", name: "Test", type: "shirt", photoUrl: "blob:http://localhost/xyz" });
    const row = upsertCalls[0][0];
    expect(row.photo_url).toBeNull();
  });

  it("writes valid storage URL to photo_url", async () => {
    await pushGarment({ id: "g1", name: "Test", type: "shirt", photoUrl: "https://storage.supabase.co/photo.jpg" });
    const row = upsertCalls[0][0];
    expect(row.photo_url).toBe("https://storage.supabase.co/photo.jpg");
  });

  it("maps camelCase fields to snake_case DB columns", async () => {
    await pushGarment({
      id: "g1", name: "Test", type: "jacket", color: "navy",
      photoType: "garment", needsReview: true, duplicateOf: "g0",
      excludeFromWardrobe: true, accentColor: "gold",
      subtype: "blazer", material: "wool", pattern: "plaid",
      seasons: ["fall"], contexts: ["formal"], price: 150,
      weight: "medium", fit: "regular",
    });
    const row = upsertCalls[0][0];
    expect(row.photo_type).toBe("garment");
    expect(row.needs_review).toBe(true);
    expect(row.duplicate_of).toBe("g0");
    expect(row.exclude_from_wardrobe).toBe(true);
    expect(row.accent_color).toBe("gold");
    expect(row.subtype).toBe("blazer");
    expect(row.material).toBe("wool");
    expect(row.pattern).toBe("plaid");
    expect(row.seasons).toEqual(["fall"]);
    expect(row.contexts).toEqual(["formal"]);
    expect(row.price).toBe(150);
    expect(row.weight).toBe("medium");
    expect(row.fit).toBe("regular");
  });
});

describe("deleteGarment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls = [];
  });

  it("calls supabase.from('garments').delete()", async () => {
    await deleteGarment("g1");
    const { supabase } = await import("../src/services/supabaseClient.js");
    expect(supabase.from).toHaveBeenCalledWith("garments");
  });

  it("does not throw on error", async () => {
    await expect(deleteGarment("g-bad")).resolves.not.toThrow();
  });
});

describe("pushHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls = [];
  });

  it("wraps outfit fields in payload object", async () => {
    await pushHistoryEntry({
      id: "h1", watchId: "w1", date: "2026-04-11",
      outfit: { shirt: "s1" }, garmentIds: ["s1"], strapId: "str1",
      context: "hospital", notes: "test note",
    });
    const row = upsertCalls[0][0];
    expect(row.payload.outfit).toEqual({ shirt: "s1" });
    expect(row.payload.garmentIds).toEqual(["s1"]);
    expect(row.payload.strapId).toBe("str1");
    expect(row.payload.context).toBe("hospital");
    expect(row.payload.notes).toBe("test note");
    expect(row.payload.payload_version).toBe("v1");
  });

  it("maps watchId to watch_id column", async () => {
    await pushHistoryEntry({ id: "h1", watchId: "snowflake", date: "2026-04-11" });
    const row = upsertCalls[0][0];
    expect(row.watch_id).toBe("snowflake");
  });
});

describe("deleteHistoryEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls delete on history table", async () => {
    await deleteHistoryEntry("h1");
    const { supabase } = await import("../src/services/supabaseClient.js");
    expect(supabase.from).toHaveBeenCalledWith("history");
  });

  it("does not throw on error", async () => {
    await expect(deleteHistoryEntry("h-bad")).resolves.not.toThrow();
  });
});
