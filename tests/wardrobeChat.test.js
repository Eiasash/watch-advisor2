import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

let mockCallClaudeResult;

vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn(async () => mockCallClaudeResult),
  getConfiguredModel: vi.fn(async () => "claude-haiku-4-5-20251001"),
  extractText: vi.fn((res, fallback) => res?.content?.[0]?.text ?? fallback ?? ""),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({ data: [{ id: "g1", name: "Shirt", type: "shirt", category: "shirt", color: "white" }], error: null })),
            })),
          })),
        };
      }
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === "app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
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

const { handler } = await import("../netlify/functions/wardrobe-chat.js");

describe("wardrobe-chat", () => {
  let origFetch;

  beforeEach(() => {
    mockCallClaudeResult = {
      content: [{ type: "text", text: "Great choice! That white shirt pairs well with navy chinos." }],
    };
    process.env.CLAUDE_API_KEY = "test-key";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    // Mock fetch for Open-Meteo weather call
    origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ current: { temperature_2m: 18 } }),
    }));
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("exports a handler function", () => {
    expect(typeof handler).toBe("function");
  });

  it("returns 204 for OPTIONS (CORS preflight)", async () => {
    const res = await handler({ httpMethod: "OPTIONS", headers: {} });
    expect(res.statusCode).toBe(204);
  });

  it("returns 405 for GET requests", async () => {
    const res = await handler({ httpMethod: "GET", headers: {} });
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when message is missing", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("message");
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    delete process.env.CLAUDE_API_KEY;
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ message: "What should I wear?" }),
    });
    expect(res.statusCode).toBe(500);
  });

  it("returns response from Claude on valid request", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ message: "What should I wear today?" }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.response).toBeDefined();
    expect(body.response).toContain("white shirt");
  });

  it("passes weather context when client provides it", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        message: "What should I wear?",
        context: { weather: { tempC: 22 }, todayContext: "clinic" },
      }),
    });
    expect(res.statusCode).toBe(200);
  });

  it("handles conversation history", async () => {
    const res = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        message: "And what about shoes?",
        conversationHistory: [
          { role: "user", content: "What shirt should I wear?" },
          { role: "assistant", content: "Try the white oxford." },
        ],
      }),
    });
    expect(res.statusCode).toBe(200);
  });
});
