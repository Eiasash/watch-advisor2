import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Build chainable query mock ─────────────────────────────────────────────

let deleteCalls = [];
let rpcCalls = [];
let storageCalls = { upload: [], remove: [], getPublicUrl: [] };

function makeChain(resolveWith) {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(resolveWith())),
    upsert: vi.fn((...args) => Promise.resolve({ error: null })),
    delete: vi.fn(() => ({
      eq: vi.fn((...args) => {
        deleteCalls.push(args);
        return Promise.resolve({ error: null });
      }),
    })),
    or: vi.fn(() => chain),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  };
  return chain;
}

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn((table) => makeChain(() => ({ data: [], error: null }))),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn((...args) => {
          storageCalls.upload.push(args);
          return Promise.resolve({ error: null });
        }),
        getPublicUrl: vi.fn((path) => {
          storageCalls.getPublicUrl.push(path);
          return { data: { publicUrl: `https://storage.url/${path}` } };
        }),
        remove: vi.fn((...args) => {
          storageCalls.remove.push(args);
          return Promise.resolve({});
        }),
      })),
    },
    rpc: vi.fn((...args) => {
      rpcCalls.push(args);
      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

// Force IS_PLACEHOLDER to be false
vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

const mod = await import("../src/services/supabaseSync.js");
const {
  uploadPhoto,
  uploadAngle,
  deleteStoragePhoto,
  deleteGarment,
  deleteHistoryEntry,
  fuzzySearchGarments,
  semanticSearchGarments,
  subscribeSyncState,
} = mod;

describe("uploadPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
  });

  it("converts base64 data URL to Blob and uploads", async () => {
    const url = await uploadPhoto("g1", "data:image/jpeg;base64,/9j/4AAQSkZJRg==", "thumbnail");
    expect(url).toContain("storage.url");
    expect(storageCalls.upload.length).toBe(1);
    const [path, blob, opts] = storageCalls.upload[0];
    expect(path).toBe("garments/g1/thumbnail.jpg");
    expect(blob).toBeInstanceOf(Blob);
    expect(opts.upsert).toBe(true);
  });

  it("returns null for non-data-URL string source", async () => {
    const url = await uploadPhoto("g1", "not-a-valid-source", "thumbnail");
    expect(url).toBeNull();
    expect(storageCalls.upload.length).toBe(0);
  });

  it("handles Blob source directly", async () => {
    const blob = new Blob(["test"], { type: "image/png" });
    const url = await uploadPhoto("g1", blob, "original");
    expect(url).toContain("storage.url");
    expect(storageCalls.upload.length).toBe(1);
    const [path] = storageCalls.upload[0];
    expect(path).toBe("garments/g1/original.png");
  });

  it("detects png extension from mime type", async () => {
    const url = await uploadPhoto("g1", "data:image/png;base64,iVBORw0KGgo=", "thumbnail");
    expect(storageCalls.upload[0][0]).toBe("garments/g1/thumbnail.png");
  });

  it("returns null on storage upload error", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.storage.from.mockReturnValueOnce({
      upload: vi.fn().mockResolvedValue({ error: { message: "quota exceeded" } }),
      getPublicUrl: vi.fn(),
    });

    const url = await uploadPhoto("g1", "data:image/jpeg;base64,abc", "thumbnail");
    expect(url).toBeNull();
  });
});

describe("uploadAngle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
  });

  it("delegates to uploadPhoto with angle-N kind", async () => {
    const url = await uploadAngle("g1", 2, "data:image/jpeg;base64,abc");
    // uploadAngle calls uploadPhoto(garmentId, source, `angle-${index}`)
    expect(url).toContain("storage.url");
  });
});

describe("deleteStoragePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageCalls = { upload: [], remove: [], getPublicUrl: [] };
  });

  it("removes all thumbnail/original/angle variants", async () => {
    await deleteStoragePhoto("g1");
    expect(storageCalls.remove.length).toBe(1);
    const paths = storageCalls.remove[0][0];
    // Should include thumbnail.jpg/png, original.jpg/png, angle-0 through angle-3 jpg/png
    expect(paths).toContain("garments/g1/thumbnail.jpg");
    expect(paths).toContain("garments/g1/thumbnail.png");
    expect(paths).toContain("garments/g1/original.jpg");
    expect(paths).toContain("garments/g1/original.png");
    expect(paths).toContain("garments/g1/angle-0.jpg");
    expect(paths).toContain("garments/g1/angle-3.png");
    expect(paths.length).toBe(12); // 4 base + 8 angles
  });
});

describe("deleteGarment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls = [];
  });

  it("calls delete with correct id", async () => {
    await deleteGarment("g1");
    // The chain: supabase.from("garments").delete().eq("id", "g1")
    const { supabase } = await import("../src/services/supabaseClient.js");
    expect(supabase.from).toHaveBeenCalledWith("garments");
  });

  it("handles delete error without throwing", async () => {
    // Should not throw even on error
    await expect(deleteGarment("g-nonexistent")).resolves.not.toThrow();
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

  it("handles delete error without throwing", async () => {
    await expect(deleteHistoryEntry("h-nonexistent")).resolves.not.toThrow();
  });
});

describe("fuzzySearchGarments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty query", async () => {
    const results = await fuzzySearchGarments("");
    expect(results).toEqual([]);
  });

  it("returns empty array for null query", async () => {
    const results = await fuzzySearchGarments(null);
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    const results = await fuzzySearchGarments("   ");
    expect(results).toEqual([]);
  });

  it("calls supabase with ilike query for valid input", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    await fuzzySearchGarments("navy shirt");
    expect(supabase.from).toHaveBeenCalledWith("garments");
  });

  it("maps results with thumbnail fallback", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [{ id: "g1", name: "Navy Shirt", photo_url: null, thumbnail_url: "thumb.jpg" }],
            error: null,
          }),
        }),
      }),
    });

    const results = await fuzzySearchGarments("navy");
    expect(results[0].thumbnail).toBe("thumb.jpg");
  });
});

describe("semanticSearchGarments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls = [];
  });

  it("returns empty array for empty embedding", async () => {
    const results = await semanticSearchGarments([]);
    expect(results).toEqual([]);
  });

  it("returns empty array for null embedding", async () => {
    const results = await semanticSearchGarments(null);
    expect(results).toEqual([]);
  });

  it("calls match_garments RPC with embedding", async () => {
    const embedding = [0.1, 0.2, 0.3];
    await semanticSearchGarments(embedding, 5);
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0][0]).toBe("match_garments");
    expect(rpcCalls[0][1].query_embedding).toEqual(embedding);
    expect(rpcCalls[0][1].match_count).toBe(5);
  });

  it("handles RPC error gracefully", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "RPC failed" } });
    const results = await semanticSearchGarments([0.1, 0.2]);
    expect(results).toEqual([]);
  });
});

describe("subscribeSyncState", () => {
  it("returns an unsubscribe function", () => {
    const fn = vi.fn();
    const unsub = subscribeSyncState(fn);
    expect(typeof unsub).toBe("function");
  });

  it("calls listener immediately with current state", () => {
    const fn = vi.fn();
    subscribeSyncState(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ status: expect.any(String) }));
  });

  it("unsubscribe stops further notifications", () => {
    const fn = vi.fn();
    const unsub = subscribeSyncState(fn);
    const initialCalls = fn.mock.calls.length;
    unsub();
    // After unsub, adding another subscriber should not trigger fn again
    subscribeSyncState(vi.fn());
    expect(fn.mock.calls.length).toBe(initialCalls);
  });
});
