import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
