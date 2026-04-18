import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockHistoryData = [];
let mockGarmentsData = [];
let mockScoringOverrides = null; // null = no overrides stored

const mockUpdateEq = vi.fn(() => ({ data: null, error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));

const mockUpsert = vi.fn(() => ({ data: null, error: null }));

const mockFrom = vi.fn((table) => {
  if (table === "history") {
    return {
      select: vi.fn(() => ({
        order: vi.fn(() => ({ data: mockHistoryData, error: null })),
      })),
      update: mockUpdate,
    };
  }
  if (table === "garments") {
    return {
      select: vi.fn(() => ({
        data: mockGarmentsData,
        error: null,
      })),
    };
  }
  if (table === "app_config") {
    return {
      upsert: mockUpsert,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(() => ({
            data: mockScoringOverrides !== null
              ? [{ value: mockScoringOverrides }]
              : [],
            error: null,
          })),
        })),
      })),
    };
  }
  return { select: vi.fn(() => ({ data: null, error: null })) };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

describe("auto-heal handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-key");
    mockHistoryData = [];
    mockGarmentsData = [];
    mockScoringOverrides = null;
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockUpdateEq.mockClear();
    mockUpsert.mockClear();

    const mod = await import("../netlify/functions/auto-heal.js");
    handler = mod.handler;
  });

  it("returns 500 when env vars are missing", async () => {
    // Temporarily clear all possible env vars the handler checks
    const savedUrl = process.env.SUPABASE_URL;
    const savedViteUrl = process.env.VITE_SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const savedSvcKey = process.env.SUPABASE_SERVICE_KEY;
    const savedAnon = process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;

    const result = await handler();
    expect(result.statusCode).toBe(500);
    expect(result.body).toContain("Missing env vars");

    // Restore
    process.env.SUPABASE_URL = savedUrl;
    process.env.VITE_SUPABASE_URL = savedViteUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    process.env.SUPABASE_SERVICE_KEY = savedSvcKey;
    process.env.VITE_SUPABASE_ANON_KEY = savedAnon;
  });

  it("returns 200 with healthy status when no issues found", async () => {
    const result = await handler();
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.healthy).toBe(true);
    expect(body.checks).toBe(9);
    expect(body.fixes).toBe(0);
  });

  it("detects orphaned history entries and stamps them", async () => {
    mockHistoryData = [
      { id: "today-abc", date: "2026-04-01", watch_id: "w1", payload: {} },
      { id: "custom-xyz", date: "2026-04-02", watch_id: "w2", payload: {} },
    ];

    const result = await handler();
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.fixesList[0]).toContain("stamped 2 orphaned entries");
  });

  it("skips entries with garmentIds as non-orphans", async () => {
    mockHistoryData = [
      { id: "entry-1", date: "2026-04-01", watch_id: "w1", payload: { garmentIds: ["g1", "g2"] } },
    ];

    const result = await handler();
    const body = JSON.parse(result.body);
    const orphanCheck = body.findings.find(f => f.check === "orphans");
    expect(orphanCheck.found).toBe(0);
    expect(orphanCheck.action).toBe("none");
  });

  it("detects watch rotation stagnation (>40% same watch in last 10)", async () => {
    mockHistoryData = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      date: `2026-04-0${i + 1}`,
      watch_id: i < 5 ? "stagnant-watch" : `watch-${i}`,
      payload: { garmentIds: ["g1"] },
    }));

    const result = await handler();
    const body = JSON.parse(result.body);
    const stagnation = body.findings.find(f => f.check === "watch_stagnation");
    expect(stagnation.found).toContain("stagnant-watch");
    expect(stagnation.action).toContain("auto-tuned");
  });

  it("reports healthy watch rotation when distributed", async () => {
    mockHistoryData = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      date: `2026-04-0${i + 1}`,
      watch_id: `watch-${i}`,
      payload: { garmentIds: ["g1"] },
    }));

    const result = await handler();
    const body = JSON.parse(result.body);
    const stagnation = body.findings.find(f => f.check === "watch_stagnation");
    expect(stagnation.found).toBe("healthy");
  });

  it("detects garment stagnation (>5× same garment in 14 days)", async () => {
    const today = new Date();
    mockHistoryData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return {
        id: `e${i}`,
        date: d.toISOString().split("T")[0],
        watch_id: "w1",
        payload: { garmentIds: ["repeat-shirt"] },
      };
    });

    const result = await handler();
    const body = JSON.parse(result.body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toContain("repeat-shirt");
    expect(gStag.action).toContain("auto-tuned");
  });

  it("writes heal result to app_config", async () => {
    await handler();
    expect(mockUpsert).toHaveBeenCalled();
    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.key).toBe("auto_heal_log");
    expect(upsertArg.value.checks).toBe(9);
  });

  it("includes all 9 diagnostic checks in findings", async () => {
    const result = await handler();
    const body = JSON.parse(result.body);
    const checkNames = body.findings.map(f => f.check);
    expect(checkNames).toContain("orphans");
    expect(checkNames).toContain("stale_unscored");
    expect(checkNames).toContain("watch_stagnation");
    expect(checkNames).toContain("garment_stagnation");
    expect(checkNames).toContain("context_distribution");
    expect(checkNames).toContain("untagged_garments");
    expect(checkNames).toContain("score_distribution");
    expect(checkNames).toContain("never_worn");
    expect(checkNames).toContain("outfit_photo_trap");
    expect(body.findings.length).toBe(9);
  });

  it("flags outfit-photo entries with garment-word names as suspicious (trap guard)", async () => {
    mockGarmentsData = [
      // Legit phantom outfit-photos — should NOT be flagged
      { id: "g_1773488261178_3hyhy", name: "IMG20260208060236", category: "outfit-photo", exclude_from_wardrobe: false },
      { id: "g_1773488197114_5sr9m", name: "84315", category: "outfit-photo", exclude_from_wardrobe: false },
      // Real garments miscategorized — SHOULD be flagged
      { id: "g_20260404_pavarotti_trousers", name: "Navy Suit Mirror Selfie", category: "outfit-photo", exclude_from_wardrobe: false },
      { id: "g_1775897419_whtee1", name: "White V-Neck Basic Tee", category: "outfit-photo", exclude_from_wardrobe: false },
      // Already excluded — should be skipped even if suspicious-looking
      { id: "g_1773490572693_2ybo2", name: "Tan Textured Knit Pullover", category: "outfit-photo", exclude_from_wardrobe: true },
    ];
    const result = await handler();
    const body = JSON.parse(result.body);
    const trap = body.findings.find(f => f.check === "outfit_photo_trap");
    expect(trap.action).toContain("WARN");
    expect(trap.action).toContain("2 real garment"); // exactly 2 suspicious
    expect(trap.found).toContain("pavarotti_trousers"); // handcrafted id caught
    expect(trap.found).toContain("White V-Neck Basic Tee"); // garment word caught
    expect(trap.found).not.toContain("IMG20260208060236"); // pure phantom
    expect(trap.found).not.toContain("Pullover"); // already excluded → skipped
    expect(body.healthy).toBe(false); // warnings flip healthy false
  });

  it("reports outfit_photo_trap healthy when no suspicious entries", async () => {
    mockGarmentsData = [
      { id: "g_1773488261178_3hyhy", name: "IMG20260208060236", category: "outfit-photo", exclude_from_wardrobe: false },
      { id: "g_1773488197114_5sr9m", name: "84315", category: "outfit-photo", exclude_from_wardrobe: false },
    ];
    const result = await handler();
    const body = JSON.parse(result.body);
    const trap = body.findings.find(f => f.check === "outfit_photo_trap");
    expect(trap.found).toBe("healthy");
    expect(trap.action).toBe("none");
  });

  it("stamps today-prefixed orphans as legacy", async () => {
    mockHistoryData = [
      { id: "today-123", date: "2026-04-01", watch_id: "w1", payload: {} },
    ];
    await handler();
    expect(mockUpdate).toHaveBeenCalled();
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.payload.legacy).toBe(true);
    expect(updateArg.payload.payload_version).toBe("v1");
  });

  it("stamps non-legacy orphans as quickLog", async () => {
    mockHistoryData = [
      { id: "abc-123", date: "2026-04-01", watch_id: "w1", payload: {} },
    ];
    await handler();
    expect(mockUpdate).toHaveBeenCalled();
    const updateArg = mockUpdate.mock.calls[0][0];
    expect(updateArg.payload.quickLog).toBe(true);
  });

  it("reports 'at limit' for watch stagnation when rotationFactor already at cap (0.60)", async () => {
    // Pre-set override at the cap
    mockScoringOverrides = { rotationFactor: 0.60 };
    mockHistoryData = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      date: `2026-04-0${i + 1}`,
      watch_id: i < 5 ? "capped-watch" : `watch-${i}`,
      payload: { garmentIds: ["g1"] },
    }));

    const result = await handler();
    const body = JSON.parse(result.body);
    const stagnation = body.findings.find(f => f.check === "watch_stagnation");
    expect(stagnation.found).toContain("capped-watch");
    expect(stagnation.action).toBe("at limit");
  });

  it("reports 'at limit' for garment stagnation when repetitionPenalty already at cap (-0.40)", async () => {
    mockScoringOverrides = { repetitionPenalty: -0.40 };
    const today = new Date();
    mockHistoryData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return {
        id: `e${i}`,
        date: d.toISOString().split("T")[0],
        watch_id: "w1",
        payload: { garmentIds: ["repeat-shirt"] },
      };
    });

    const result = await handler();
    const body = JSON.parse(result.body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toContain("repeat-shirt");
    expect(gStag.action).toBe("at limit");
  });

  it("each stagnation check reports its own tuning independently (regression: shared tuned array bug)", async () => {
    // Both watch stagnation AND garment stagnation active simultaneously.
    // watch_stagnation should auto-tune rotationFactor.
    // garment_stagnation cap hit — should report "at limit", NOT the rotation tuning result.
    mockScoringOverrides = { repetitionPenalty: -0.40 }; // garment cap hit
    const today = new Date();
    // 10 entries, 5 same watch (stagnant) + 7 repeat same garment (stagnant)
    mockHistoryData = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return {
        id: `e${i}`,
        date: d.toISOString().split("T")[0],
        watch_id: i < 5 ? "stagnant-watch" : `watch-${i}`,
        payload: { garmentIds: ["repeat-shirt"] },
      };
    });

    const result = await handler();
    const body = JSON.parse(result.body);
    const watchStag = body.findings.find(f => f.check === "watch_stagnation");
    const gStag = body.findings.find(f => f.check === "garment_stagnation");

    // Watch rotation should have tuned (rotationFactor not at cap)
    expect(watchStag.action).toContain("auto-tuned");
    expect(watchStag.action).toContain("rotationFactor");

    // Garment stagnation should independently report "at limit" — NOT inherit rotation tuning
    expect(gStag.action).toBe("at limit");
    expect(gStag.action).not.toContain("rotationFactor");
  });
});
