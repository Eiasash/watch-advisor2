import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockHistory;
let mockGarments;
let mockOverrides;
let mockUpsertCalled;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({ data: mockHistory, error: null })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({ data: mockGarments, error: null })),
            })),
          })),
        };
      }
      if (table === "app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({ data: mockOverrides, error: null })),
            })),
          })),
          upsert: vi.fn(() => { mockUpsertCalled = true; return { error: null }; }),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ limit: vi.fn(() => ({ data: [], error: null })) })) })) };
    },
  }),
}));

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Content-Type": "application/json",
  }),
}));

const { handler } = await import("../netlify/functions/monthly-report.js");

describe("monthly-report", () => {
  beforeEach(() => {
    mockHistory = [];
    mockGarments = [];
    mockOverrides = [];
    mockUpsertCalled = false;
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("exports a handler function", () => {
    expect(typeof handler).toBe("function");
  });

  it("returns 500 when env vars missing", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    const res = await handler();
    expect(res.statusCode).toBe(500);
  });

  it("returns 200 with report structure on success", async () => {
    mockHistory = [
      { id: "h1", date: new Date().toISOString().slice(0, 7) + "-01", watch_id: "santos", payload: { garmentIds: ["g1"], score: 8, context: "clinic" } },
    ];
    mockGarments = [
      { id: "g1", name: "White shirt", exclude_from_wardrobe: false, category: "shirt" },
    ];
    const res = await handler();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.generatedAt).toBeDefined();
    expect(body.period).toBeDefined();
    expect(body.period.thisMonth).toBeDefined();
    expect(body.period.lastMonth).toBeDefined();
    expect(body.wearFrequency).toBeDefined();
    expect(body.watchDiversity).toBeDefined();
    expect(body.scoreTrend).toBeDefined();
    expect(body.garmentUtilization).toBeDefined();
    expect(body.contextDistribution).toBeDefined();
    expect(body.topRepeatedGarments).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.summary.improved).toBeInstanceOf(Array);
    expect(body.summary.degraded).toBeInstanceOf(Array);
  });

  it("caches report to app_config", async () => {
    mockHistory = [];
    mockGarments = [];
    await handler();
    expect(mockUpsertCalled).toBe(true);
  });

  it("handles empty history gracefully", async () => {
    mockHistory = [];
    mockGarments = [{ id: "g1", name: "Shirt", exclude_from_wardrobe: false, category: "shirt" }];
    const res = await handler();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.wearFrequency.thisMonth).toBe(0);
    expect(body.wearFrequency.lastMonth).toBe(0);
    expect(body.watchDiversity.thisMonth.ratio).toBe(0);
  });

  it("computes watch diversity ratio correctly", async () => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    mockHistory = [
      { id: "h1", date: `${thisMonth}-01`, watch_id: "santos", payload: {} },
      { id: "h2", date: `${thisMonth}-02`, watch_id: "santos", payload: {} },
      { id: "h3", date: `${thisMonth}-03`, watch_id: "pasha", payload: {} },
    ];
    mockGarments = [];
    const res = await handler();
    const body = JSON.parse(res.body);
    // 2 unique watches / 3 total = 0.67
    expect(body.watchDiversity.thisMonth.unique).toBe(2);
    expect(body.watchDiversity.thisMonth.total).toBe(3);
    expect(body.watchDiversity.thisMonth.ratio).toBe(0.67);
  });
});
