/**
 * tests/auth.test.js
 *
 * Coverage for netlify/functions/_auth.js — the JWT + email-allowlist
 * gate that guards every browser-callable function.
 *
 * Why this file exists:
 *   _auth.js shipped via PRs #138-#140 across 17 functions and 14 frontend
 *   callers. It had ZERO direct tests. The behaviour is non-trivial:
 *     - Three-state rollout flag (true / false / unset)
 *     - Production-context auto-enforcement
 *     - Allowlist + explicit "scary second flag" to disable in prod
 *     - Bearer parsing (case-insensitive header, trim, slicing)
 *     - Misconfigured-creds = 500 (not 401 — caller is innocent)
 *     - Missing allowlist = 500 (fail closed, surface deploy bug)
 *
 * Each branch is a regression risk if a future refactor "simplifies" the
 * three-state flag back into a boolean. These tests pin the contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @supabase/supabase-js so requireUser doesn't try to talk to a live
// Supabase project. Tests control the auth.getUser response per case.
const getUserMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}));

// Import AFTER the mock so the module-scoped admin client picks up the stub.
const { requireUser } = await import("../netlify/functions/_auth.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

function eventWith(authHeader) {
  return { headers: authHeader ? { authorization: authHeader } : {} };
}

function setEnv(overrides) {
  // Wipe the relevant env vars first so tests don't bleed into each other.
  delete process.env.AUTH_GATE_ENABLED;
  delete process.env.NODE_ENV;
  delete process.env.CONTEXT;
  delete process.env.ALLOW_INSECURE_PROD;
  delete process.env.ALLOWED_USER_EMAIL;
  delete process.env.SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  Object.assign(process.env, overrides);
}

beforeEach(() => {
  getUserMock.mockReset();
  setEnv({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  });
});

afterEach(() => {
  setEnv({});
});

// ── Rollout flag — three-state evaluation ────────────────────────────────────

describe("requireUser — rollout flag states", () => {
  it("AUTH_GATE_ENABLED=true → gate ON, demands a token", async () => {
    setEnv({ AUTH_GATE_ENABLED: "true", ALLOWED_USER_EMAIL: "eias@example.com" });
    const r = await requireUser(eventWith(""));
    expect(r.statusCode).toBe(401);
    expect(r.error).toMatch(/missing Bearer token/i);
  });

  it("flag unset + non-prod (no NODE_ENV, no CONTEXT) → gate OFF (dev default)", async () => {
    setEnv({}); // wipe everything
    const r = await requireUser(eventWith(""));
    expect(r.gateDisabled).toBe(true);
    expect(r.user).toBeNull();
    expect(r.error).toBeUndefined();
  });

  it("flag unset + Netlify CONTEXT=production → gate ENFORCED (prod default)", async () => {
    setEnv({ CONTEXT: "production", ALLOWED_USER_EMAIL: "eias@example.com" });
    const r = await requireUser(eventWith(""));
    expect(r.statusCode).toBe(401);
  });

  it("flag unset + NODE_ENV=production → gate ENFORCED (prod default)", async () => {
    setEnv({ NODE_ENV: "production", ALLOWED_USER_EMAIL: "eias@example.com" });
    const r = await requireUser(eventWith(""));
    expect(r.statusCode).toBe(401);
  });

  it("AUTH_GATE_ENABLED=false in non-prod → gate OFF (explicit dev opt-out)", async () => {
    setEnv({ AUTH_GATE_ENABLED: "false" });
    const r = await requireUser(eventWith(""));
    expect(r.gateDisabled).toBe(true);
  });

  it("AUTH_GATE_ENABLED=false in prod WITHOUT ALLOW_INSECURE_PROD → gate STILL ON", async () => {
    // The whole point of this branch: a single misconfigured flag must not
    // disable the gate in production. Two scary flags required.
    setEnv({
      AUTH_GATE_ENABLED: "false",
      CONTEXT: "production",
      ALLOWED_USER_EMAIL: "eias@example.com",
    });
    const r = await requireUser(eventWith(""));
    expect(r.statusCode).toBe(401); // still asking for a token
  });

  it("AUTH_GATE_ENABLED=false + prod + ALLOW_INSECURE_PROD=true → gate OFF", async () => {
    setEnv({
      AUTH_GATE_ENABLED: "false",
      NODE_ENV: "production",
      ALLOW_INSECURE_PROD: "true",
    });
    const r = await requireUser(eventWith(""));
    expect(r.gateDisabled).toBe(true);
  });

  it("ALLOW_INSECURE_PROD case-insensitive (TRUE accepted)", async () => {
    setEnv({
      AUTH_GATE_ENABLED: "false",
      CONTEXT: "production",
      ALLOW_INSECURE_PROD: "TRUE",
    });
    const r = await requireUser(eventWith(""));
    expect(r.gateDisabled).toBe(true);
  });

  it("AUTH_GATE_ENABLED arbitrary value ('1', 'on') is NOT 'true' → falls through to defaults", async () => {
    setEnv({ AUTH_GATE_ENABLED: "1" }); // no isProd → off
    const r = await requireUser(eventWith(""));
    expect(r.gateDisabled).toBe(true);
  });
});

// ── Bearer token parsing ─────────────────────────────────────────────────────

describe("requireUser — Bearer token parsing", () => {
  beforeEach(() => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      ALLOWED_USER_EMAIL: "eias@example.com",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
  });

  it("missing Authorization header → 401", async () => {
    const r = await requireUser({ headers: {} });
    expect(r.statusCode).toBe(401);
    expect(r.error).toContain("missing Bearer token");
  });

  it("Authorization header without 'Bearer ' prefix → 401", async () => {
    const r = await requireUser(eventWith("Basic abcdef"));
    expect(r.statusCode).toBe(401);
  });

  it("'Bearer ' with empty token → 401", async () => {
    const r = await requireUser(eventWith("Bearer "));
    expect(r.statusCode).toBe(401);
  });

  it("'Bearer ' with whitespace-only token → 401 (trimmed to empty)", async () => {
    const r = await requireUser(eventWith("Bearer    "));
    expect(r.statusCode).toBe(401);
  });

  it("accepts capitalized 'Authorization' header key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "eias@example.com" } }, error: null });
    const r = await requireUser({ headers: { Authorization: "Bearer valid-token" } });
    expect(r.user?.email).toBe("eias@example.com");
  });

  it("accepts lowercase 'authorization' header key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "eias@example.com" } }, error: null });
    const r = await requireUser({ headers: { authorization: "Bearer valid-token" } });
    expect(r.user?.email).toBe("eias@example.com");
  });

  it("event without headers object at all → 401 (defensive)", async () => {
    const r = await requireUser({});
    expect(r.statusCode).toBe(401);
  });

  it("null event → 401 (defensive)", async () => {
    const r = await requireUser(null);
    expect(r.statusCode).toBe(401);
  });
});

// ── Token validation against Supabase ────────────────────────────────────────

describe("requireUser — Supabase token validation", () => {
  beforeEach(() => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      ALLOWED_USER_EMAIL: "eias@example.com",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
  });

  it("supabase returns error → 401 (invalid token)", async () => {
    getUserMock.mockResolvedValue({ data: null, error: { message: "JWT expired" } });
    const r = await requireUser(eventWith("Bearer expired-token"));
    expect(r.statusCode).toBe(401);
    expect(r.error).toContain("invalid token");
  });

  it("supabase returns no user → 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const r = await requireUser(eventWith("Bearer noop-token"));
    expect(r.statusCode).toBe(401);
  });

  it("supabase getUser throws → 500 (server-side problem, not caller's)", async () => {
    getUserMock.mockRejectedValue(new Error("network down"));
    const r = await requireUser(eventWith("Bearer x"));
    expect(r.statusCode).toBe(500);
    expect(r.error).toContain("network down");
  });

  it("missing SUPABASE_URL → 500 (server misconfigured)", async () => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      ALLOWED_USER_EMAIL: "eias@example.com",
      // SUPABASE_URL deliberately absent
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    // The admin client is module-cached, so to test this we'd need a fresh
    // import. Instead we verify that the throw propagates as 500 by triggering
    // it indirectly: getAdminClient throws inside the try/catch at the call
    // site. We can simulate by making getUserMock throw the same way.
    getUserMock.mockImplementation(() => {
      throw new Error("Missing Supabase credentials for auth validation");
    });
    const r = await requireUser(eventWith("Bearer x"));
    expect(r.statusCode).toBe(500);
    expect(r.error).toMatch(/Missing Supabase credentials|Auth check failed/);
  });
});

// ── Email allowlist enforcement ──────────────────────────────────────────────

describe("requireUser — email allowlist", () => {
  beforeEach(() => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      ALLOWED_USER_EMAIL: "eias@example.com",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
  });

  it("user email matches allowlist → returns user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "eias@example.com" } }, error: null });
    const r = await requireUser(eventWith("Bearer good"));
    expect(r.error).toBeUndefined();
    expect(r.user.id).toBe("u1");
    expect(r.user.email).toBe("eias@example.com");
  });

  it("matching is case-insensitive (user uppercase, env lowercase)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "EIAS@example.com" } }, error: null });
    const r = await requireUser(eventWith("Bearer good"));
    expect(r.user?.email).toBe("EIAS@example.com");
  });

  it("matching trims whitespace", async () => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      ALLOWED_USER_EMAIL: "  eias@example.com  ",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    getUserMock.mockResolvedValue({ data: { user: { email: "eias@example.com" } }, error: null });
    const r = await requireUser(eventWith("Bearer good"));
    expect(r.user).toBeDefined();
  });

  it("non-allowlisted email → 403 (not 401 — they HAD a valid JWT)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "intruder@example.com" } }, error: null });
    const r = await requireUser(eventWith("Bearer valid-but-wrong-user"));
    expect(r.statusCode).toBe(403);
    expect(r.error).toMatch(/not on allowlist/i);
  });

  it("user without email field → 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    const r = await requireUser(eventWith("Bearer x"));
    expect(r.statusCode).toBe(403);
  });

  it("ALLOWED_USER_EMAIL unset → 500 fail-closed (NOT 200, NOT 'allow all')", async () => {
    setEnv({
      AUTH_GATE_ENABLED: "true",
      // ALLOWED_USER_EMAIL deliberately absent
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    getUserMock.mockResolvedValue({ data: { user: { email: "anyone@example.com" } }, error: null });
    const r = await requireUser(eventWith("Bearer x"));
    expect(r.statusCode).toBe(500);
    expect(r.error).toMatch(/ALLOWED_USER_EMAIL/);
  });
});
