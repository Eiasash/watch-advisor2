/**
 * Schema-enforcement tests for style-fixed-watch endpoint (PR #146).
 *
 * The whole point of this endpoint existing is to REJECT requests that
 * don't have a pinnedWatch. Without these tests, future-me could refactor
 * the wrapper away and lose the architectural separation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mock surface as dailyPick.test.js so the wrapper can delegate cleanly.
vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn(),
  getConfiguredModel: vi.fn().mockResolvedValue("claude-haiku-4-5-20251001"),
  extractText: (r, fallback = "") => r?.content?.[0]?.text ?? fallback,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
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

vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

const { createClient } = await import("@supabase/supabase-js");
const claudeMod = await import("../netlify/functions/_claudeClient.js");
const { handler } = await import("../netlify/functions/style-fixed-watch.js");

describe("style-fixed-watch", () => {
  let supabaseMock;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAUDE_API_KEY = "test-key";
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

    supabaseMock = {};
    for (const m of ["from", "select", "eq", "not", "gte", "order", "limit"]) {
      supabaseMock[m] = vi.fn().mockReturnValue(supabaseMock);
    }
    supabaseMock.single = vi.fn().mockResolvedValue({ data: null });
    supabaseMock.upsert = vi.fn().mockResolvedValue({ data: null });
    createClient.mockReturnValue(supabaseMock);
  });

  it("OPTIONS returns 204 with CORS headers (preflight)", async () => {
    const res = await handler({ httpMethod: "OPTIONS" });
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("non-POST returns 405", async () => {
    const res = await handler({ httpMethod: "GET" });
    expect(res.statusCode).toBe(405);
  });

  it("missing pinnedWatch → 400 with helpful error pointing to daily-pick", async () => {
    const res = await handler({ httpMethod: "POST", body: JSON.stringify({ forceRefresh: true }) });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("pinnedWatch.id required");
    expect(body.error).toContain("daily-pick"); // points caller to the open-watch alternative
  });

  it("pinnedWatch without id → 400", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ pinnedWatch: { brand: "Tudor", model: "BB41" } }), // no id
    });
    expect(res.statusCode).toBe(400);
  });

  it("pinnedWatch with empty string id → 400", async () => {
    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ pinnedWatch: { id: "" } }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("malformed JSON body → 400 (not 500)", async () => {
    const res = await handler({ httpMethod: "POST", body: "{not valid json" });
    expect(res.statusCode).toBe(400);
  });

  it("valid pinnedWatch → delegates to daily-pick (Claude is called)", async () => {
    supabaseMock.not = vi.fn().mockResolvedValue({ data: [{ id: "s1", name: "Shirt", type: "shirt", category: "shirt", color: "white" }] });
    supabaseMock.order = vi.fn().mockResolvedValue({ data: [] });
    claudeMod.callClaude.mockResolvedValue({
      content: [{ text: '{"watch":"Tudor BB41","watchId":"blackbay","strap":"steel bracelet","shirt":null,"sweater":null,"layer":null,"pants":"p","shoes":"s","jacket":null,"belt":null,"reasoning":"r","score":7,"layerTip":null}' }],
    });

    const res = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        forceRefresh: true,
        pinnedWatch: { id: "blackbay", brand: "Tudor", model: "BB41", dial: "black-red", style: "sport", formality: 6, straps: [] },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(claudeMod.callClaude).toHaveBeenCalled();
    // The PINNED WATCH prompt block must show up in the prompt text — that's
    // what makes "fixed watch" actually fixed at the model layer.
    const promptText = claudeMod.callClaude.mock.calls[0][1].messages[0].content;
    expect(promptText).toContain("PINNED WATCH");
    expect(promptText).toContain("blackbay");
  });
});
