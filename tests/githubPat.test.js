import { describe, it, expect, vi, beforeEach } from "vitest";

let handler;
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("OPEN_API_KEY", "secret-XYZ");
  vi.stubEnv("GITHUB_PAT", "ghp_test_pat_value");
  const mod = await import("../netlify/functions/github-pat.js");
  handler = mod.handler;
});

describe("github-pat handler", () => {
  it("returns 204 for OPTIONS preflight (no body required)", async () => {
    const res = await handler({ httpMethod: "OPTIONS", headers: {} });
    expect(res.statusCode).toBe(204);
  });

  it("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await handler({ httpMethod: method, headers: { "x-api-secret": "secret-XYZ" } });
      expect(res.statusCode).toBe(405);
    }
  });

  it("returns 401 when x-api-secret header is missing", async () => {
    const res = await handler({ httpMethod: "GET", headers: {} });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-secret does not match OPEN_API_KEY", async () => {
    const res = await handler({ httpMethod: "GET", headers: { "x-api-secret": "wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("returns 500 when GITHUB_PAT env var is not configured", async () => {
    vi.stubEnv("GITHUB_PAT", "");
    const mod = await import("../netlify/functions/github-pat.js");
    const res = await mod.handler({ httpMethod: "GET", headers: { "x-api-secret": "secret-XYZ" } });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/not configured/i);
  });

  it("returns the PAT JSON-encoded on a valid GET", async () => {
    const res = await handler({ httpMethod: "GET", headers: { "x-api-secret": "secret-XYZ" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(res.body).pat).toBe("ghp_test_pat_value");
  });

  it("does not leak the PAT in any non-200 response body", async () => {
    const wrong = await handler({ httpMethod: "GET", headers: { "x-api-secret": "wrong" } });
    expect(wrong.body ?? "").not.toContain("ghp_test_pat_value");
    const noSecret = await handler({ httpMethod: "GET", headers: {} });
    expect(noSecret.body ?? "").not.toContain("ghp_test_pat_value");
    const badMethod = await handler({ httpMethod: "POST", headers: { "x-api-secret": "secret-XYZ" } });
    expect(badMethod.body ?? "").not.toContain("ghp_test_pat_value");
  });
});
