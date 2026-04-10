import { describe, it, expect } from "vitest";
import { cors } from "../netlify/functions/_cors.js";

describe("_cors.js — CORS helper", () => {
  // ── Allowed origins ───────────────────────────────────────────────────────

  it("allows production origin", () => {
    const headers = cors({ headers: { origin: "https://watch-advisor2.netlify.app" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("allows localhost:5173 (Vite dev)", () => {
    const headers = cors({ headers: { origin: "http://localhost:5173" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });

  it("allows localhost:4173 (Vite preview)", () => {
    const headers = cors({ headers: { origin: "http://localhost:4173" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:4173");
  });

  it("allows deploy preview URLs (pattern: *.netlify.app)", () => {
    const origin = "https://deploy-preview-42--watch-advisor2.netlify.app";
    const headers = cors({ headers: { origin } });
    expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
  });

  it("allows branch deploy preview URLs", () => {
    const origin = "https://feat-test--watch-advisor2.netlify.app";
    const headers = cors({ headers: { origin } });
    expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
  });

  // ── Rejected origins ──────────────────────────────────────────────────────

  it("falls back to production for unknown origin", () => {
    const headers = cors({ headers: { origin: "https://evil-site.com" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("falls back to production for empty origin", () => {
    const headers = cors({ headers: { origin: "" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("falls back to production when headers are missing", () => {
    const headers = cors({});
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("falls back to production for null event", () => {
    const headers = cors(null);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("rejects non-netlify.app deploy URLs", () => {
    const headers = cors({ headers: { origin: "https://deploy-preview-42--other-site.netlify.app" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  it("rejects http:// deploy preview (must be https)", () => {
    const headers = cors({ headers: { origin: "http://deploy-preview-42--watch-advisor2.netlify.app" } });
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://watch-advisor2.netlify.app");
  });

  // ── Standard headers ──────────────────────────────────────────────────────

  it("includes required CORS headers", () => {
    const headers = cors({ headers: { origin: "https://watch-advisor2.netlify.app" } });
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, GET, OPTIONS");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Vary"]).toBe("Origin");
  });
});
