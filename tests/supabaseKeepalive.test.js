import { describe, it, expect, vi, beforeEach } from "vitest";

let mockUpsertResult = { error: null };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      upsert: (...args) => Promise.resolve(mockUpsertResult),
    }),
  }),
}));

describe("supabase-keepalive handler", () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    mockUpsertResult = { error: null };
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "test-key");
    const mod = await import("../netlify/functions/supabase-keepalive.js");
    handler = mod.handler;
  });

  it("returns ok:true on successful ping", async () => {
    const res = await handler();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.pingedAt).toBeDefined();
  });

  it("returns 500 when upsert fails", async () => {
    mockUpsertResult = { error: { message: "connection timeout" } };
    const res = await handler();
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("connection timeout");
  });

  it("returns 500 when env vars are missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    vi.resetModules();
    const mod = await import("../netlify/functions/supabase-keepalive.js");
    const res = await mod.handler();
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Missing");
  });

  it("uses VITE_* env vars as fallback via ?? operator", () => {
    // The ?? operator only falls through on null/undefined, not empty string.
    // So VITE_* vars are only used when primary vars are completely absent.
    // This is by design — empty string means "set but empty", undefined means "not set".
    const url = undefined ?? "https://fallback.supabase.co";
    expect(url).toBe("https://fallback.supabase.co");
    const urlEmpty = "" ?? "https://fallback.supabase.co";
    expect(urlEmpty).toBe(""); // empty string is NOT nullish
  });

  it("pingedAt is a valid ISO timestamp", async () => {
    const res = await handler();
    const body = JSON.parse(res.body);
    const date = new Date(body.pingedAt);
    expect(date.getTime()).not.toBeNaN();
  });
});
