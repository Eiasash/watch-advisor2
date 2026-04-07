import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

let mockHistory;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            not: vi.fn(() => ({ data: mockHistory, error: null })),
          })),
        };
      }
      if (table === "app_config") {
        return {
          upsert: vi.fn(() => ({ error: null })),
        };
      }
      return { select: vi.fn(() => ({ not: vi.fn(() => ({ data: [], error: null })) })) };
    },
  }),
}));

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Content-Type": "application/json",
  }),
}));

const { handler } = await import("../netlify/functions/watch-value.js");

describe("watch-value", () => {
  beforeEach(() => {
    mockHistory = [];
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("exports a handler function", () => {
    expect(typeof handler).toBe("function");
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const res = await handler({ httpMethod: "OPTIONS", headers: {} });
    expect(res.statusCode).toBe(204);
  });

  it("returns 200 with collection data on GET", async () => {
    mockHistory = [
      { watch_id: "santos_large" },
      { watch_id: "santos_large" },
      { watch_id: "pasha" },
    ];
    const res = await handler({ httpMethod: "GET", headers: {} });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalValueILS).toBeGreaterThan(0);
    expect(body.totalWears).toBe(3);
    expect(body.collection).toBeInstanceOf(Array);
    expect(body.collection.length).toBeGreaterThan(0);
    expect(body.updatedAt).toBeDefined();
  });

  it("computes CPW correctly for worn watches", async () => {
    mockHistory = [
      { watch_id: "speedmaster" },
      { watch_id: "speedmaster" },
      { watch_id: "speedmaster" },
      { watch_id: "speedmaster" },
    ];
    const res = await handler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(res.body);
    const speedy = body.collection.find(w => w.id === "speedmaster");
    expect(speedy).toBeDefined();
    expect(speedy.wears).toBe(4);
    // 24000 / 4 = 6000
    expect(speedy.cpw).toBe(6000);
    expect(speedy.cpwLabel).toContain("6,000");
  });

  it("never-worn watches have null CPW and 'never worn' label", async () => {
    mockHistory = [];
    const res = await handler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(res.body);
    const laco = body.collection.find(w => w.id === "laco");
    expect(laco).toBeDefined();
    expect(laco.wears).toBe(0);
    expect(laco.cpw).toBeNull();
    expect(laco.cpwLabel).toBe("never worn");
  });

  it("identifies rising value watches", async () => {
    const res = await handler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(res.body);
    expect(body.risingValue).toBeInstanceOf(Array);
    expect(body.risingValue).toContain("rikka");
    expect(body.risingValue).toContain("laureato");
  });

  it("bestCPW and worstCPW are null when no watches worn", async () => {
    mockHistory = [];
    const res = await handler({ httpMethod: "GET", headers: {} });
    const body = JSON.parse(res.body);
    expect(body.bestCPW).toBeNull();
    expect(body.worstCPW).toBeNull();
    expect(body.avgCPW).toBeNull();
  });
});
