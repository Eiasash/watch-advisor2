import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

// Build a fluent mock that returns the correct data at the end of any chain
function fluentMock(resolveValue) {
  const handler = {
    get(target, prop) {
      if (prop === "then") {
        // Make it thenable — when awaited, resolve to the value
        return (resolve) => resolve(resolveValue);
      }
      // Any method call returns itself for chaining
      return (...args) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "app_config") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: [] }),
              single: () => Promise.resolve({ data: null }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === "garments") {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: [] }),
            }),
            or: () => ({
              not: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      if (table === "history") {
        return {
          select: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      return fluentMock({ data: [] });
    },
  }),
}));

describe("style-dna handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

    const mod = await import("../netlify/functions/style-dna.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
  });

  it("returns not-enough-history when no entries exist", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Not enough history");
    expect(body.entries).toBe(0);
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    vi.resetModules();
    const mod = await import("../netlify/functions/style-dna.js");
    const res = await mod.handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("CLAUDE_API_KEY");
  });

  it("returns 500 when Supabase credentials are missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.resetModules();
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    const mod = await import("../netlify/functions/style-dna.js");
    const res = await mod.handler({
      httpMethod: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("includes CORS headers on responses", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ forceRefresh: true }),
    });
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });
});
