import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockHistoryData = [];
let mockGarmentsData = [];

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
    };
  }
  return { select: vi.fn(() => ({ data: null, error: null })) };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
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
    expect(body.checks).toBe(7);
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
    expect(upsertArg.value.checks).toBe(7);
  });

  it("includes all 7 diagnostic checks in findings", async () => {
    const result = await handler();
    const body = JSON.parse(result.body);
    const checkNames = body.findings.map(f => f.check);
    expect(checkNames).toContain("orphans");
    expect(checkNames).toContain("watch_stagnation");
    expect(checkNames).toContain("garment_stagnation");
    expect(checkNames).toContain("context_distribution");
    expect(checkNames).toContain("untagged_garments");
    expect(checkNames).toContain("score_distribution");
    expect(checkNames).toContain("never_worn");
    expect(body.findings.length).toBe(7);
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
});
