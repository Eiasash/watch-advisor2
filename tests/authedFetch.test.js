import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: { auth: { getSession: (...args) => getSession(...args) } },
}));

let fetchMock;
beforeEach(() => {
  getSession.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  globalThis.fetch = fetchMock;
});

describe("authedFetch", () => {
  it("attaches Authorization: Bearer <token> when a session exists", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "JWT-XYZ" } } });
    const { authedFetch } = await import("../src/services/authedFetch.js");
    await authedFetch("/.netlify/functions/foo", { method: "POST" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer JWT-XYZ");
    expect(init.method).toBe("POST");
  });

  it("does NOT attach Authorization when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { authedFetch } = await import("../src/services/authedFetch.js");
    await authedFetch("/.netlify/functions/foo");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("preserves caller-supplied headers (Content-Type etc.)", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "JWT" } } });
    const { authedFetch } = await import("../src/services/authedFetch.js");
    await authedFetch("/foo", { headers: { "Content-Type": "application/json", "X-Custom": "abc" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Custom"]).toBe("abc");
    expect(init.headers.Authorization).toBe("Bearer JWT");
  });

  it("falls through to fetch unauthenticated when getSession() throws", async () => {
    getSession.mockRejectedValue(new Error("supabase client unavailable"));
    const { authedFetch } = await import("../src/services/authedFetch.js");
    const res = await authedFetch("/foo");
    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("does not attach Authorization when access_token is missing in session", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: "a@b.c" } } } });
    const { authedFetch } = await import("../src/services/authedFetch.js");
    await authedFetch("/foo");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("propagates the URL/input untouched to fetch", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "T" } } });
    const { authedFetch } = await import("../src/services/authedFetch.js");
    await authedFetch("/.netlify/functions/claude-stylist?x=1");
    expect(fetchMock).toHaveBeenCalledWith("/.netlify/functions/claude-stylist?x=1", expect.any(Object));
  });
});
