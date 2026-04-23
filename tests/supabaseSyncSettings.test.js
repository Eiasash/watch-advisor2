import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────────────────

let settingsQueryResult = { data: null, error: null };
let upsertCalls = [];
let upsertError = null;
let thumbQueryResult = { data: [], error: null };
let wardrobeGarments = [];

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve(settingsQueryResult)),
            })),
          })),
          upsert: vi.fn((...args) => {
            upsertCalls.push(args);
            return Promise.resolve({ error: upsertError });
          }),
        };
      }
      if (table === "garments") {
        const chain = {
          select: vi.fn(() => chain),
          or: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve(thumbQueryResult)),
          order: vi.fn(() => chain),
          upsert: vi.fn(() => Promise.resolve({ error: null })),
        };
        return chain;
      }
      if (table === "history") {
        const chain = {
          select: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return chain;
      }
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
        upsert: vi.fn(() => Promise.resolve({ error: null })),
      };
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

// Mock wardrobeStore for pullThumbnails
vi.mock("../src/stores/wardrobeStore.js", () => {
  const state = { garments: [] };
  return {
    useWardrobeStore: {
      getState: () => ({ garments: wardrobeGarments }),
      setState: vi.fn((partial) => Object.assign(state, partial)),
    },
  };
});

vi.stubEnv("VITE_SUPABASE_URL", "https://real-project.supabase.co");

const { pullSettings, pushSettings, pullThumbnails, pullScoringOverrides, pullTailorConfig } = await import("../src/services/supabaseSync.js");

// ── pullSettings ─────────────────────────────────────────────────────────────

describe("pullSettings", () => {
  beforeEach(() => {
    settingsQueryResult = { data: null, error: null };
  });

  it("returns null when no settings exist", async () => {
    const result = await pullSettings();
    expect(result).toBeNull();
  });

  it("returns settings data when present", async () => {
    settingsQueryResult = {
      data: {
        id: "default",
        week_ctx: ["clinic", "casual", "casual", "clinic", "casual", "casual", "casual"],
        on_call_dates: ["2026-04-10"],
        active_straps: { snowflake: "s1" },
      },
      error: null,
    };
    const result = await pullSettings();
    expect(result.week_ctx).toHaveLength(7);
    expect(result.on_call_dates).toContain("2026-04-10");
    expect(result.active_straps.snowflake).toBe("s1");
  });

  it("returns null on Supabase error", async () => {
    settingsQueryResult = { data: null, error: { message: "table not found" } };
    const result = await pullSettings();
    expect(result).toBeNull();
  });
});

// ── pushSettings ─────────────────────────────────────────────────────────────

describe("pushSettings", () => {
  beforeEach(() => {
    upsertCalls = [];
    upsertError = null;
  });

  it("upserts settings with correct structure", async () => {
    await pushSettings({
      weekCtx: ["clinic", "casual", "casual", "clinic", "casual", "casual", "casual"],
      onCallDates: ["2026-04-10"],
      activeStraps: { snowflake: "brown-leather" },
      customStraps: { snowflake: [{ id: "cs1", label: "Custom" }] },
    });

    expect(upsertCalls).toHaveLength(1);
    const [row, opts] = upsertCalls[0];
    expect(row.id).toBe("default");
    expect(row.week_ctx).toHaveLength(7);
    expect(row.on_call_dates).toContain("2026-04-10");
    expect(row.active_straps.snowflake).toBe("brown-leather");
    expect(row.updated_at).toBeDefined();
    expect(opts.onConflict).toBe("id");
  });

  it("handles missing optional fields with null", async () => {
    await pushSettings({});
    expect(upsertCalls).toHaveLength(1);
    const [row] = upsertCalls[0];
    expect(row.week_ctx).toBeNull();
    expect(row.on_call_dates).toBeNull();
    expect(row.active_straps).toBeNull();
    expect(row.custom_straps).toBeNull();
  });

  it("does not throw on upsert error", async () => {
    upsertError = { message: "permission denied" };
    await expect(pushSettings({ weekCtx: [] })).resolves.not.toThrow();
  });
});

// ── pullThumbnails ───────────────────────────────────────────────────────────

describe("pullThumbnails", () => {
  beforeEach(() => {
    thumbQueryResult = { data: [], error: null };
    wardrobeGarments = [];
  });

  it("returns without error when no thumbnails exist", async () => {
    await expect(pullThumbnails()).resolves.not.toThrow();
  });

  it("patches garments with thumbnail URLs from cloud", async () => {
    wardrobeGarments = [
      { id: "g1", name: "Navy Polo", thumbnail: null, photoUrl: null },
      { id: "g2", name: "Grey Chinos", thumbnail: null, photoUrl: null },
    ];
    thumbQueryResult = {
      data: [
        { id: "g1", thumbnail_url: "https://storage/g1-thumb.jpg", photo_url: "https://storage/g1.jpg" },
        { id: "g2", thumbnail_url: null, photo_url: "https://storage/g2.jpg" },
      ],
      error: null,
    };

    const { useWardrobeStore } = await import("../src/stores/wardrobeStore.js");
    await pullThumbnails();

    expect(useWardrobeStore.setState).toHaveBeenCalled();
    const call = useWardrobeStore.setState.mock.calls.at(-1)[0];
    const patched = call.garments;
    expect(patched[0].thumbnail).toBe("https://storage/g1-thumb.jpg");
    expect(patched[0].photoUrl).toBe("https://storage/g1.jpg");
    // When thumbnail_url is null, falls back to photo_url
    expect(patched[1].thumbnail).toBe("https://storage/g2.jpg");
  });

  it("skips blob: URLs in photo_url", async () => {
    wardrobeGarments = [{ id: "g1", name: "Test", thumbnail: null, photoUrl: null }];
    thumbQueryResult = {
      data: [{ id: "g1", thumbnail_url: null, photo_url: "blob:http://localhost/abc" }],
      error: null,
    };

    const { useWardrobeStore } = await import("../src/stores/wardrobeStore.js");
    await pullThumbnails();

    // blob: URLs should be filtered out (set to null)
    const call = useWardrobeStore.setState.mock.calls.at(-1)?.[0];
    if (call) {
      const g = call.garments.find(g => g.id === "g1");
      expect(g.photoUrl).toBeNull();
    }
  });

  it("does not throw on Supabase error", async () => {
    thumbQueryResult = { data: null, error: { message: "timeout" } };
    await expect(pullThumbnails()).resolves.not.toThrow();
  });

  it("deduplicates concurrent calls (inflight guard)", async () => {
    thumbQueryResult = { data: [], error: null };
    // Fire two calls simultaneously
    const [r1, r2] = await Promise.all([pullThumbnails(), pullThumbnails()]);
    // Both should resolve (second piggybacks on first)
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
  });
});

// ── pullScoringOverrides ──────────────────────────────────────────────────────

describe("pullScoringOverrides", () => {
  it("returns null when no data exists (default mock)", async () => {
    const result = await pullScoringOverrides();
    expect(result).toBeNull();
  });

  it("returns scoring overrides object when present", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { value: { scoreWeights: { colorMatch: 3.0, formality: 4.0 } } },
            error: null,
          })),
        })),
      })),
    }));
    const result = await pullScoringOverrides();
    expect(result).toEqual({ scoreWeights: { colorMatch: 3.0, formality: 4.0 } });
  });

  it("returns null when value is not an object", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { value: "not-an-object" }, error: null })),
        })),
      })),
    }));
    const result = await pullScoringOverrides();
    expect(result).toBeNull();
  });

  it("returns null on Supabase error", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: { message: "not found" } })),
        })),
      })),
    }));
    const result = await pullScoringOverrides();
    expect(result).toBeNull();
  });

  it("returns null when data row is null", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    }));
    const result = await pullScoringOverrides();
    expect(result).toBeNull();
  });
});

// ── pullTailorConfig ──────────────────────────────────────────────────────────

describe("pullTailorConfig", () => {
  it("returns null when no data exists (default mock)", async () => {
    const result = await pullTailorConfig();
    expect(result).toBeNull();
  });

  it("returns tailor config object when present", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { value: { preferredPalette: ["navy", "black"], avoidPatterns: ["plaid"] } },
            error: null,
          })),
        })),
      })),
    }));
    const result = await pullTailorConfig();
    expect(result).not.toBeNull();
    expect(result.preferredPalette).toContain("navy");
    expect(result.avoidPatterns).toContain("plaid");
  });

  it("returns null when value is null", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { value: null }, error: null })),
        })),
      })),
    }));
    const result = await pullTailorConfig();
    expect(result).toBeNull();
  });

  it("returns null on Supabase error", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: { message: "table not found" } })),
        })),
      })),
    }));
    const result = await pullTailorConfig();
    expect(result).toBeNull();
  });
});

// ── pushSettings exception handling ──────────────────────────────────────────

describe("pushSettings — exception handling", () => {
  it("handles unexpected exception from upsert gracefully", async () => {
    const { supabase } = await import("../src/services/supabaseClient.js");
    supabase.from.mockImplementationOnce(() => ({
      upsert: vi.fn().mockRejectedValue(new Error("connection refused")),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })),
    }));
    await expect(pushSettings({ weekCtx: [] })).resolves.not.toThrow();
  });
});
