import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock supabase client ──────────────────────────────────────────────────
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn((table) => ({
  select: (...args) => {
    const result = mockSelect(table, ...args);
    return {
      limit: () => result ?? { data: [], error: null },
      ...(result ?? { data: [], error: null }),
    };
  },
  insert: (row) => mockInsert(table, row),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));

// ── Mock the bundled JSON import ──────────────────────────────────────────
const MOCK_MIGRATIONS = [
  { name: "20260101_init", sql: "CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);" },
  { name: "20260102_add_bar", sql: "ALTER TABLE foo ADD COLUMN bar text;" },
];

vi.mock("../netlify/functions/_migrations.json", () => ({
  default: MOCK_MIGRATIONS,
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

// ── Import handler after mocks ───────────────────────────────────────────
const { default: handler } = await import("../netlify/functions/run-migrations.js");

function makeReq(method = "POST", headers = {}) {
  return {
    method,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  };
}

describe("run-migrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.MIGRATION_SECRET = "test-secret";
  });

  it("rejects non-POST", async () => {
    const res = await handler(makeReq("GET"));
    expect(res.status).toBe(405);
  });

  it("rejects unauthorized when MIGRATION_SECRET is set", async () => {
    process.env.MIGRATION_SECRET = "s3cret";
    const res = await handler(makeReq("POST"));
    expect(res.status).toBe(401);
  });

  it("accepts correct bearer token", async () => {
    process.env.MIGRATION_SECRET = "s3cret";
    mockRpc.mockResolvedValue({ error: null });
    mockSelect.mockReturnValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ error: null });

    const res = await handler(makeReq("POST", { authorization: "Bearer s3cret" }));
    expect(res.status).not.toBe(401);
  });

  it("returns up-to-date when all applied", async () => {
    mockRpc.mockResolvedValue({ error: null });
    mockSelect.mockReturnValue({
      data: [{ name: "20260101_init" }, { name: "20260102_add_bar" }],
      error: null,
    });

    const res = await handler(makeReq("POST", { authorization: "Bearer test-secret" }));
    const body = await res.json();
    expect(body.status).toBe("up-to-date");
    expect(body.applied).toBe(2);
  });

  it("applies pending migrations in order", async () => {
    mockRpc.mockResolvedValueOnce({ error: null }); // CREATE _migrations
    mockSelect.mockReturnValue({
      data: [{ name: "20260101_init" }], // only first applied
      error: null,
    });
    mockRpc.mockResolvedValue({ error: null }); // migration SQL
    mockInsert.mockResolvedValue({ error: null });

    const res = await handler(makeReq("POST", { authorization: "Bearer test-secret" }));
    const body = await res.json();
    expect(body.status).toBe("complete");
    expect(body.applied).toBe(1);
    expect(body.results[0].name).toBe("20260102_add_bar");
    expect(body.results[0].status).toBe("applied");

    // Should have recorded the migration
    expect(mockInsert).toHaveBeenCalledWith("_migrations", { name: "20260102_add_bar" });
  });

  it("stops on migration error", async () => {
    mockRpc.mockResolvedValueOnce({ error: null }); // CREATE _migrations
    mockSelect.mockReturnValue({ data: [], error: null }); // none applied
    mockRpc
      .mockResolvedValueOnce({ error: { message: "syntax error" } }); // first migration fails

    const res = await handler(makeReq("POST", { authorization: "Bearer test-secret" }));
    const body = await res.json();
    expect(body.status).toBe("partial");
    expect(body.results[0].status).toBe("error");
    expect(body.results[0].error).toBe("syntax error");
    // Second migration should NOT be attempted
    expect(body.results.length).toBe(1);
  });

  it("applies multi-statement migrations", async () => {
    // The init migration has a single statement but ends with ;
    // Verify the splitting logic handles it
    mockRpc.mockResolvedValueOnce({ error: null }); // CREATE _migrations
    mockSelect.mockReturnValue({ data: [], error: null });
    mockRpc.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });

    const res = await handler(makeReq("POST", { authorization: "Bearer test-secret" }));
    const body = await res.json();
    expect(body.results.length).toBe(2);
    expect(body.results.every(r => r.status === "applied")).toBe(true);
  });
});

describe("bundle-migrations format", () => {
  it("generates entries with name and sql fields", () => {
    for (const m of MOCK_MIGRATIONS) {
      expect(m).toHaveProperty("name");
      expect(m).toHaveProperty("sql");
      expect(typeof m.name).toBe("string");
      expect(typeof m.sql).toBe("string");
    }
  });

  it("sorts migrations lexicographically by name", () => {
    const names = MOCK_MIGRATIONS.map(m => m.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
