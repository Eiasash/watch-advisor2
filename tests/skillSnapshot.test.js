import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockGarmentCount;
let mockHistoryCount;
let mockOrphans;
let mockMigrations;
let mockAppSettings;
let mockAppConfigRows;
let mockScoreTrend;
let mockWardrobeHealth;

const mockSingle = vi.fn(() => {
  const key = mockSingle._lastKey;
  const row = mockAppConfigRows[key];
  return { data: row ?? null, error: null };
});

const mockRpc = vi.fn(() => ({ data: mockWardrobeHealth, error: null }));

const mockFrom = vi.fn((table) => {
  if (table === "garments") {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          not: vi.fn(() => ({
            count: mockGarmentCount,
            error: null,
          })),
        })),
      })),
    };
  }
  if (table === "history") {
    return {
      select: vi.fn((_, opts) => {
        if (opts?.count === "exact" && opts?.head === true) {
          return { count: mockHistoryCount, error: null };
        }
        return {
          or: vi.fn(() => ({ data: mockOrphans, error: null })),
          gte: vi.fn(() => ({
            order: vi.fn(() => ({ data: mockScoreTrend, error: null })),
          })),
        };
      }),
    };
  }
  if (table === "schema_migrations") {
    return {
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({ data: mockMigrations, error: null })),
        })),
      })),
    };
  }
  if (table === "app_settings") {
    return {
      select: vi.fn(() => ({
        limit: vi.fn(() => ({ data: mockAppSettings, error: null })),
      })),
    };
  }
  if (table === "app_config") {
    return {
      select: vi.fn(() => ({
        eq: vi.fn((_, key) => {
          mockSingle._lastKey = key;
          return { single: mockSingle };
        }),
      })),
    };
  }
  return { select: vi.fn(() => ({ data: null, error: null })) };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

describe("skill-snapshot handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "test-key");
    mockGarmentCount = 42;
    mockHistoryCount = 100;
    mockOrphans = [];
    mockMigrations = [{ version: "20260401" }];
    mockAppSettings = [{ key: "theme", value: "dark" }];
    mockAppConfigRows = {
      claude_model: { value: "claude-haiku-4-5-20251001" },
      monthly_token_usage: { value: { input: 1000, output: 500 } },
      auto_heal_log: { value: { healthy: true, ranAt: "2026-04-01" } },
    };
    mockScoreTrend = [];
    mockWardrobeHealth = null;
    mockFrom.mockClear();

    const mod = await import("../netlify/functions/skill-snapshot.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const result = await handler({ httpMethod: "OPTIONS" });
    expect(result.statusCode).toBe(204);
  });

  it("returns 405 for non-GET methods", async () => {
    const result = await handler({ httpMethod: "POST" });
    expect(result.statusCode).toBe(405);
  });

  it("returns 200 with snapshot for GET", async () => {
    const result = await handler({ httpMethod: "GET" });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.snapshotAt).toBeDefined();
    expect(body.appUrl).toBe("https://watch-advisor2.netlify.app");
  });

  it("uses correct field name netlifySiteId (not netliftSiteId)", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.netlifySiteId).toBe("4d21d73c-b37f-4d3a-8954-8347045536dd");
    expect(body.netliftSiteId).toBeUndefined();
  });

  it("includes health section in response", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.health).toBeDefined();
    expect(body.health.garments).toBeDefined();
    expect(body.health.history).toBeDefined();
    expect(body.health.orphanedHistory).toBeDefined();
  });

  it("includes scoring weights with expected keys", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.scoringWeights).toBeDefined();
    expect(body.scoringWeights.colorMatch).toBe(2.5);
    expect(body.scoringWeights.formalityMatch).toBe(3.0);
    expect(body.scoringWeights.watchCompatibility).toBe(3.0);
    expect(body.scoringWeights.diversityFactor).toBe(-0.12);
  });

  it("includes CORS headers on all responses", async () => {
    const r200 = await handler({ httpMethod: "GET" });
    expect(r200.headers["Access-Control-Allow-Origin"]).toBe("*");

    const r405 = await handler({ httpMethod: "POST" });
    expect(r405.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("reports orphaned history count", async () => {
    mockOrphans = [
      { id: "o1", date: "2026-04-01", payload: {} },
      { id: "o2", date: "2026-04-02", payload: {} },
    ];
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.orphanedHistoryCount).toBe(2);
    expect(body.health.orphanedHistory).toContain("WARN");
  });

  it("excludes legacy/quickLog entries from orphan count", async () => {
    mockOrphans = [
      { id: "o1", date: "2026-04-01", payload: { legacy: true } },
      { id: "o2", date: "2026-04-02", payload: { quickLog: true } },
    ];
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.orphanedHistoryCount).toBe(0);
  });
});
