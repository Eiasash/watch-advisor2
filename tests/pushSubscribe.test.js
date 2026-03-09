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

describe("push-subscribe handler", () => {
  let handler;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
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
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("POST success returns 200 with ok:true", async () => {
    const r = await handler({
      httpMethod: "POST",
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

  it("POST returns 400 when subscription is missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({}),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing subscription");
  });

  it("POST returns 400 when subscription.endpoint is missing", async () => {
    const r = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ subscription: { keys: {} } }),
    });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error).toContain("Missing subscription");
  });

  it("DELETE success returns 200", async () => {
    const r = await handler({
      httpMethod: "DELETE",
      body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("endpoint", "https://push.example.com/sub1");
  });

  it("DELETE returns 400 when endpoint is missing", async () => {
    const r = await handler({
      httpMethod: "DELETE",
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
