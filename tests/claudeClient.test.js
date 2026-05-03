import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

describe("getConfiguredModel", () => {
  let getConfiguredModel, _resetModelCache;
  const ORIG_ENV = { ...process.env };

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
    // Restore env and then strip Supabase vars
    Object.assign(process.env, ORIG_ENV);
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const mod = await import("../netlify/functions/_claudeClient.js");
    getConfiguredModel = mod.getConfiguredModel;
    _resetModelCache = mod._resetModelCache;
    _resetModelCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns DEFAULT_MODEL when env vars are missing", async () => {
    const model = await getConfiguredModel();
    expect(model).toBe("claude-sonnet-4-6");
    // Supabase should never be called when credentials absent
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns DEFAULT_MODEL when Supabase REST call throws (network error)", async () => {
    process.env.SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    vi.resetModules();
    _resetModelCache?.();
    const mod2 = await import("../netlify/functions/_claudeClient.js");
    fetch.mockRejectedValue(new Error("Network error"));
    const model = await mod2.getConfiguredModel();
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("returns DEFAULT_MODEL when DB returns no matching row (null body)", async () => {
    process.env.SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    vi.resetModules();
    _resetModelCache?.();
    const mod2 = await import("../netlify/functions/_claudeClient.js");
    // PostgREST 406 when single() matches zero rows
    fetch.mockResolvedValue({
      ok: false,
      status: 406,
      statusText: "Not Acceptable",
      text: () => Promise.resolve(""),
      headers: { get: () => null },
    });
    const model = await mod2.getConfiguredModel();
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("returns model from DB when app_config has claude_model row", async () => {
    process.env.SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    vi.resetModules();
    const mod2 = await import("../netlify/functions/_claudeClient.js");
    mod2._resetModelCache();
    // PostgREST single() with Accept: application/vnd.pgrst.object+json returns a plain JSON object
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ value: '"claude-opus-4-6"' })),
      headers: { get: (h) => h === "content-type" ? "application/vnd.pgrst.object+json" : null },
    });
    const model = await mod2.getConfiguredModel();
    expect(model).toBe("claude-opus-4-6");
  });

  it("caches model after first successful DB read", async () => {
    process.env.SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    vi.resetModules();
    const mod2 = await import("../netlify/functions/_claudeClient.js");
    mod2._resetModelCache();
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ value: '"claude-opus-4-6"' })),
      headers: { get: (h) => h === "content-type" ? "application/vnd.pgrst.object+json" : null },
    });
    const first  = await mod2.getConfiguredModel();
    const second = await mod2.getConfiguredModel();
    const third  = await mod2.getConfiguredModel();
    // First call reads from DB; remaining calls use in-memory cache
    expect(first).toBe("claude-opus-4-6");
    expect(second).toBe("claude-opus-4-6");
    expect(third).toBe("claude-opus-4-6");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("callClaude", () => {
  let callClaude;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
    const mod = await import("../netlify/functions/_claudeClient.js");
    callClaude = mod.callClaude;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("successful API call returns parsed JSON", async () => {
    const mockResponse = { id: "msg_123", content: [{ text: "hello" }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await callClaude("test-key", { model: "claude-3", messages: [] });
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
  });

  it("non-ok response throws 'Claude API error: {status}'", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: () => Promise.resolve("Bad request body"),
    });

    await expect(callClaude("test-key", {})).rejects.toThrow("Claude API error: 400");
  });

  it("error body included in error message (sliced to 200 chars)", async () => {
    const longBody = "A".repeat(300);
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: { get: () => null },
      text: () => Promise.resolve(longBody),
    });

    await expect(callClaude("test-key", {})).rejects.toThrow(
      `Claude API error: 422 — ${"A".repeat(200)}`,
    );
  });

  it("sends correct headers including anthropic-version", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ content: [] }),
    });

    await callClaude("my-key", { model: "claude-3" });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");
    expect(opts.headers["content-type"]).toBe("application/json");
  });

  it("retries on 529 and succeeds on second attempt", async () => {
    const mockResponse = { id: "msg_ok", content: [{ text: "ok" }] };
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 529,
        headers: { get: () => null },
        text: () => Promise.resolve("overloaded"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

    const result = await callClaude("test-key", {});
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it("retries on 503 and succeeds on second attempt", async () => {
    const mockResponse = { id: "msg_ok2", content: [{ text: "ok" }] };
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: () => Promise.resolve("service unavailable"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

    const result = await callClaude("test-key", {});
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it("max 3 attempts then throws on final 529", async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 529,
      headers: { get: () => null },
      text: () => Promise.resolve("overloaded"),
    });

    // 3rd attempt: attempt=2, MAX-1=2 → condition false → falls to !res.ok → throws
    await expect(callClaude("test-key", {})).rejects.toThrow("Claude API error: 529");
    expect(fetch).toHaveBeenCalledTimes(3);
  }, 30000);
});
