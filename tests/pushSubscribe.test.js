import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockDelete = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({
  upsert: mockUpsert,
  delete: mockDelete,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
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

// Auth mock — flip authMode per test to assert gate behavior.
let authMode = "pass"; // "pass" | "401" | "403"
vi.mock("../netlify/functions/_auth.js", () => ({
  requireUser: vi.fn(async () => {
    if (authMode === "401") return { error: "Unauthorized: missing Bearer token", statusCode: 401 };
    if (authMode === "403") return { error: "Forbidden: not on allowlist", statusCode: 403 };
    return { user: { email: "eiasashhab@gmail.com" } };
  }),
}));

describe("push-subscribe handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("OPEN_API_KEY", "test-open-secret");
    authMode = "pass";
    mockUpsert.mockReset().mockResolvedValue({ data: null, error: null });
    mockEq.mockReset().mockResolvedValue({ data: null, error: null });
    mockDelete.mockReset().mockReturnValue({ eq: mockEq });
    mockFrom.mockReset().mockReturnValue({ upsert: mockUpsert, delete: mockDelete });
    const mod = await import("../netlify/functions/push-subscribe.js");
    handler = mod.handler;
  });

  it("returns 204 for OPTIONS", async () => {
    const r = await handler({ httpMethod: "OPTIONS" });
    expect(r.statusCode).toBe(204);
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("POST success returns 200 with ok:true", async () => {
    const r = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer valid-jwt" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://push.example.com/sub1",
          keys: { p256dh: "key1", auth: "auth1" },
        },
        deviceName: "iPhone",
      }),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.com/sub1",
        p256dh: "key1",
        auth: "auth1",
        device_name: "iPhone",
      }),
      { onConflict: "endpoint" }
    );
  });

  // ── Auth coverage — prevents v1.13.16 regression of the open-POST spam vector
  it("POST returns 401 when JWT missing (auth gate enforced)", async () => {
    authMode = "401";
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        subscription: { endpoint: "https://x", keys: { p256dh: "k", auth: "a" } },
      }),
    });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body).error).toContain("Unauthorized");
    expect(mockUpsert).not.toHaveBeenCalled();      // never reached the DB
  });

  it("POST returns 403 when JWT valid but not on allowlist", async () => {
    authMode = "403";
    const r = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer some-other-user-jwt" },
      body: JSON.stringify({
        subscription: { endpoint: "https://x", keys: { p256dh: "k", auth: "a" } },
      }),
    });
    expect(r.statusCode).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("POST returns 400 when subscription is missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer valid-jwt" },
      body: JSON.stringify({}),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing subscription");
  });

  it("POST returns 400 when subscription.endpoint is missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer valid-jwt" },
      body: JSON.stringify({ subscription: { keys: {} } }),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing subscription");
  });

  it("DELETE success returns 200", async () => {
    const r = await handler({
      httpMethod: "DELETE",
      headers: { "x-api-secret": "test-open-secret" },
      body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("endpoint", "https://push.example.com/sub1");
  });

  it("DELETE returns 401 without x-api-secret", async () => {
    const r = await handler({
      httpMethod: "DELETE",
      body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
    });
    expect(r.statusCode).toBe(401);
    expect(JSON.parse(r.body).error).toContain("Unauthorized");
  });

  it("DELETE returns 400 when endpoint is missing", async () => {
    const r = await handler({
      httpMethod: "DELETE",
      headers: { "x-api-secret": "test-open-secret" },
      body: JSON.stringify({}),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing endpoint");
  });

  it("returns 405 for PUT", async () => {
    const r = await handler({
      httpMethod: "PUT",
      body: JSON.stringify({}),
    });
    expect(r.statusCode).toBe(405);
    expect(JSON.parse(r.body).error).toContain("Method not allowed");
  });

  it("returns 500 on invalid JSON body", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: "not-json{{{",
    });
    expect(r.statusCode).toBe(500);
  });
});
