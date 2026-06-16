/**
 * Regression guards for the robustness pass (PR: authedfetch-and-model-fix).
 *
 * Three privileged browser → Netlify-function call sites historically used a
 * bare `fetch(...)` instead of `authedFetch(...)`, so they never attached the
 * Supabase Auth JWT and the server-side `_auth.js` gate would 401 them. These
 * source-level guards fail if any of them regresses back to a bare `fetch`.
 *
 * Pattern mirrors tests/noHandRolledActiveFilter.test.js — read the source,
 * assert the wiring, no React render needed (matches this repo's component
 * test style, where component logic is verified statically / via extraction).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");

describe("authedFetch wiring — privileged Netlify-function call sites", () => {
  it("OccasionPlanner imports authedFetch and uses it for the occasion-planner call", () => {
    const text = read("components/OccasionPlanner.jsx");
    expect(text).toMatch(/import\s*\{\s*authedFetch\s*\}\s*from\s*["']\.\.\/services\/authedFetch\.js["']/);
    // The API call must go through authedFetch, not a bare fetch.
    expect(text).toMatch(/await\s+authedFetch\(API,/);
    expect(text).not.toMatch(/await\s+fetch\(API,/);
  });

  it("SelfiePanel imports authedFetch and uses it for selfie-check + extract-outfit calls", () => {
    const text = read("components/SelfiePanel.jsx");
    expect(text).toMatch(/import\s*\{\s*authedFetch\s*\}\s*from\s*["']\.\.\/services\/authedFetch\.js["']/);
    // selfie-check (API) and extract-outfit (EXTRACT_API) both via authedFetch.
    expect(text).toMatch(/await\s+authedFetch\(API,/);
    expect(text).toMatch(/await\s+authedFetch\(EXTRACT_API,/);
    // No bare fetch() to either endpoint constant.
    expect(text).not.toMatch(/await\s+fetch\(API,/);
    expect(text).not.toMatch(/await\s+fetch\(EXTRACT_API,/);
  });
});

describe("ClaudePick handleWhy — res.ok guard before parsing", () => {
  it("guards res.ok in the 'Why this?' explain path", () => {
    const text = read("components/ClaudePick.jsx");
    // Isolate the handleWhy function body and assert it checks res.ok before
    // res.json(), so an error body isn't parsed as a success rationale.
    const start = text.indexOf("const handleWhy");
    expect(start).toBeGreaterThan(-1);
    const next = text.indexOf("const handleSubmitReject", start);
    const body = text.slice(start, next === -1 ? undefined : next);

    const okIdx = body.indexOf("if (!res.ok)");
    // Match the actual parse call (`await res.json()`), not a "res.json()"
    // mention inside an explanatory comment.
    const jsonIdx = body.indexOf("await res.json()");
    expect(okIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    // The guard must come before the parse.
    expect(okIdx).toBeLessThan(jsonIdx);
  });
});
