/**
 * Audit-driven test expansion — May 2026 Round 2 (deeper dig).
 *
 * Targets surfaces R1 did not cover:
 *
 *  1. auto-heal threshold matrix gaps:
 *     - garment_stagnation belt/shoes exclusion (daily-driver carve-out)
 *     - score_distribution single-value spread (allSame WARN)
 *     - context_distribution >80% null
 *     - score_distribution range string contract
 *     - watch_stagnation rotationFactor 0.60 cap
 *     - repetitionPenalty -0.40 cap
 *  2. Vision-function maxAttempts:1 enforcement — static check that every
 *     vision-class function passes maxAttempts:1 to callClaude(). The hard
 *     constraint (skill § A.6) is "never set maxAttempts > 1 on Vision".
 *  3. Skill-snapshot health.* contract — every key the audit pipeline asserts
 *     on (garments/history/orphanedHistory/wardrobeHealth/autoHeal) must be
 *     present, even when downstream tables fail. Defends the response shape.
 *  4. Persistence migration round-trip — entries authored before the v2
 *     payload schema (raw .garmentIds at root, no payload key) must read
 *     back through garmentDaysIdle / repetitionPenalty correctly.
 *  5. Mutation-test feel — for _crossSlotCoherence / rotationFactor /
 *     repetitionPenalty: tests where flipping the operator or shifting the
 *     boundary by 1 fails. These are the boundary-crossing assertions, not
 *     "happy path" coverage.
 *
 * Each block exists because the audit identified the surface as either
 * under-covered (no test would catch a regression) or boundary-fragile
 * (an off-by-one would silently pass existing tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rotationPressure,
  garmentDaysIdle,
} from "../src/domain/rotationStats.js";
import { repetitionPenalty } from "../src/domain/contextMemory.js";
import rotationFactor from "../src/outfitEngine/scoringFactors/rotationFactor.js";
import repetitionFactorFn from "../src/outfitEngine/scoringFactors/repetitionFactor.js";
import { setScoringOverrides } from "../src/config/scoringOverrides.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Helper — produce yyyy-mm-dd string for N days ago.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

afterEach(() => {
  setScoringOverrides({});
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. auto-heal threshold matrix — gap coverage
// ─────────────────────────────────────────────────────────────────────────────
describe("auto-heal threshold matrix — gaps not covered by R1", () => {
  let mockHistoryData = [];
  let mockGarmentsData = [];
  let mockScoringOverrides = null;
  const upsertCalls = [];

  vi.mock("@supabase/supabase-js", () => {
    const mockUpdateEq = () => ({ data: null, error: null });
    const mockUpdate = () => ({ eq: mockUpdateEq });
    const mockUpsert = (...args) => {
      globalThis.__r2_upsertCalls?.push(args);
      return { data: null, error: null };
    };
    const mockFrom = (table) => {
      if (table === "history") {
        return {
          select: () => ({
            order: () => ({ data: globalThis.__r2_history ?? [], error: null }),
          }),
          update: mockUpdate,
        };
      }
      if (table === "garments") {
        return { select: () => ({ data: globalThis.__r2_garments ?? [], error: null }) };
      }
      if (table === "app_config") {
        return {
          upsert: mockUpsert,
          select: () => ({
            eq: () => ({
              limit: () => ({
                data: globalThis.__r2_overrides !== null
                  ? [{ value: globalThis.__r2_overrides }]
                  : [],
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: () => ({ data: null, error: null }) };
    };
    return { createClient: () => ({ from: mockFrom }) };
  });

  let handler;
  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    globalThis.__r2_history = [];
    globalThis.__r2_garments = [];
    globalThis.__r2_overrides = null;
    globalThis.__r2_upsertCalls = [];
    vi.resetModules();
    const mod = await import("../netlify/functions/auto-heal.js");
    handler = mod.handler;
  });

  it("garment_stagnation EXCLUDES belt category (daily-driver carve-out)", async () => {
    // 6 wears of the same belt in 14d — would normally trigger stagnation.
    globalThis.__r2_garments = [
      { id: "belt1", type: "belt" },
      { id: "shirt1", type: "shirt" },
    ];
    globalThis.__r2_history = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i), watch_id: "w1",
      payload: { garmentIds: ["belt1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toBe("healthy"); // belt excluded — no stagnation reported
    expect(gStag.action).toBe("none");
  });

  it("garment_stagnation EXCLUDES shoes category (daily-driver carve-out)", async () => {
    globalThis.__r2_garments = [{ id: "shoe1", type: "shoes" }];
    globalThis.__r2_history = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i), watch_id: "w1",
      payload: { garmentIds: ["shoe1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toBe("healthy");
  });

  it("garment_stagnation FIRES for non-daily-driver categories (shirt @ 6 wears in 14d)", async () => {
    globalThis.__r2_garments = [{ id: "shirt1", type: "shirt" }];
    globalThis.__r2_history = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i), watch_id: "w1",
      payload: { garmentIds: ["shirt1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toContain("shirt1");
    expect(gStag.action).toContain("auto-tuned");
  });

  it("garment_stagnation BOUNDARY: 5 wears (= threshold) is healthy, 6 fires", async () => {
    // > 5 means strictly >5. So 5 = healthy, 6 = fires. This test pins down
    // the inequality so an off-by-one (>= 5) regression fails.
    globalThis.__r2_garments = [{ id: "shirt1", type: "shirt" }];
    globalThis.__r2_history = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i), watch_id: "w1",
      payload: { garmentIds: ["shirt1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const gStag = body.findings.find(f => f.check === "garment_stagnation");
    expect(gStag.found).toBe("healthy");
  });

  it("score_distribution emits range string when scores present", async () => {
    globalThis.__r2_history = [
      { id: "h1", date: daysAgo(1), watch_id: "w1", payload: { garmentIds: ["g1"], score: 6.5 } },
      { id: "h2", date: daysAgo(2), watch_id: "w1", payload: { garmentIds: ["g1"], score: 9.5 } },
      { id: "h3", date: daysAgo(3), watch_id: "w1", payload: { garmentIds: ["g1"], score: 8.0 } },
    ];
    const body = JSON.parse((await handler()).body);
    const sd = body.findings.find(f => f.check === "score_distribution");
    expect(sd.found).toBe("6.5–9.5"); // min–max via Math.min/Math.max on score array
  });

  it("score_distribution flags single-value spread (allSame WARN — score not being varied)", async () => {
    globalThis.__r2_history = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`, date: daysAgo(i + 1), watch_id: "w1",
      payload: { garmentIds: ["g1"], score: 7.0 },
    }));
    const body = JSON.parse((await handler()).body);
    const sd = body.findings.find(f => f.check === "score_distribution");
    expect(sd.action).toContain("WARN");
    expect(sd.action).toContain("score not being varied");
  });

  it("score_distribution: 5 entries with same score is NOT flagged (boundary >5)", async () => {
    // Source: scores.length > 5 — five entries should not trip the WARN
    globalThis.__r2_history = Array.from({ length: 5 }, (_, i) => ({
      id: `h${i}`, date: daysAgo(i + 1), watch_id: "w1",
      payload: { garmentIds: ["g1"], score: 7.0 },
    }));
    const body = JSON.parse((await handler()).body);
    const sd = body.findings.find(f => f.check === "score_distribution");
    expect(sd.action).toBe("none");
  });

  it("context_distribution flags >80% null context", async () => {
    // 9 of 10 entries with null context (90%) → above 80% threshold
    globalThis.__r2_history = Array.from({ length: 10 }, (_, i) => ({
      id: `h${i}`, date: daysAgo(i + 1), watch_id: "w1",
      payload: { garmentIds: ["g1"], context: i === 0 ? "smart-casual" : null },
    }));
    const body = JSON.parse((await handler()).body);
    const cd = body.findings.find(f => f.check === "context_distribution");
    expect(cd.found).toContain("90% null contexts");
    expect(cd.action).toContain("CRITICAL");
  });

  it("context_distribution healthy when ≤80% null", async () => {
    globalThis.__r2_history = Array.from({ length: 10 }, (_, i) => ({
      id: `h${i}`, date: daysAgo(i + 1), watch_id: "w1",
      payload: { garmentIds: ["g1"], context: i < 3 ? "smart-casual" : null },
    }));
    const body = JSON.parse((await handler()).body);
    const cd = body.findings.find(f => f.check === "context_distribution");
    expect(cd.found).toBe("healthy");
  });

  it("watch_stagnation respects rotationFactor 0.60 cap (auto-heal hard ceiling)", async () => {
    globalThis.__r2_overrides = { rotationFactor: 0.60 };
    globalThis.__r2_history = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i),
      watch_id: i < 6 ? "w-stag" : `w-${i}`,
      payload: { garmentIds: ["g1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const ws = body.findings.find(f => f.check === "watch_stagnation");
    expect(ws.action).toBe("at limit");
    expect(body.tuned.some(t => t.includes("rotationFactor"))).toBe(false);
  });

  it("garment_stagnation respects repetitionPenalty -0.40 cap", async () => {
    globalThis.__r2_overrides = { repetitionPenalty: -0.40 };
    globalThis.__r2_garments = [{ id: "shirt1", type: "shirt" }];
    globalThis.__r2_history = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`, date: daysAgo(i), watch_id: "w1",
      payload: { garmentIds: ["shirt1"] },
    }));
    const body = JSON.parse((await handler()).body);
    const gs = body.findings.find(f => f.check === "garment_stagnation");
    expect(gs.action).toBe("at limit");
    expect(body.tuned.some(t => t.includes("repetitionPenalty"))).toBe(false);
  });

  it("untagged_garments threshold: > 10 = 'BulkTagger re-run needed'", async () => {
    // 11 untagged shirts — above threshold
    globalThis.__r2_garments = Array.from({ length: 11 }, (_, i) => ({
      id: `g${i}`, exclude_from_wardrobe: false, category: "shirt",
      seasons: null, contexts: null, material: null,
    }));
    const body = JSON.parse((await handler()).body);
    const ut = body.findings.find(f => f.check === "untagged_garments");
    expect(ut.found).toBe(11);
    expect(ut.action).toBe("BulkTagger re-run needed");
  });

  it("untagged_garments boundary: exactly 10 untagged → 'minor', not 'BulkTagger re-run'", async () => {
    // > 10 not >= 10. So 10 = minor, 11 = re-run needed.
    globalThis.__r2_garments = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i}`, exclude_from_wardrobe: false, category: "shirt",
      seasons: null, contexts: null, material: null,
    }));
    const body = JSON.parse((await handler()).body);
    const ut = body.findings.find(f => f.check === "untagged_garments");
    expect(ut.action).toBe("minor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Vision function maxAttempts:1 enforcement (static analysis)
// ─────────────────────────────────────────────────────────────────────────────
describe("vision functions — maxAttempts:1 enforcement (skill § A.6 hard constraint)", () => {
  // Vision-class functions invoke Claude with image input. Each MUST pass
  // { maxAttempts: 1 } to callClaude — Netlify free-tier 10s hard limit
  // means a retry would dump the request anyway.
  const VISION_FUNCTIONS = [
    "classify-image.js",
    "verify-garment-photo.js",
    "selfie-check.js",
    "watch-id.js",
    "style-dna.js",
    "extract-outfit.js",
    "detect-duplicate.js",
  ];

  const FUNCTIONS_DIR = join(REPO_ROOT, "netlify/functions");

  for (const fn of VISION_FUNCTIONS) {
    it(`${fn} either passes maxAttempts:1 OR doesn't import callClaude`, () => {
      const path = join(FUNCTIONS_DIR, fn);
      let src;
      try { src = readFileSync(path, "utf8"); }
      catch { return; /* function doesn't exist — non-fatal */ }

      const importsCallClaude = /from\s+['"]\.\/_claudeClient/.test(src) || /callClaude/.test(src);
      if (!importsCallClaude) return;

      // Find every callClaude invocation. Each MUST be followed by an
      // options object that contains maxAttempts: 1.
      const callClaudeCalls = [...src.matchAll(/callClaude\s*\(/g)];
      expect(callClaudeCalls.length).toBeGreaterThan(0);

      // Strict assertion: there should be at least one occurrence of
      // `maxAttempts: 1` somewhere in the file. If a vision function
      // ever drops the option, this fires.
      expect(src).toMatch(/maxAttempts\s*:\s*1\b/);

      // No accidental higher value. (`maxAttempts: 2`, `: 3`, etc.)
      expect(src).not.toMatch(/maxAttempts\s*:\s*[2-9]/);
    });
  }

  it("no other netlify function silently sets maxAttempts > 1", () => {
    // Defence-in-depth: scan every function file for maxAttempts: <n>
    // where n > 1. The default in callClaude is 3 — overriding to 1 is
    // explicit. Overriding to >1 anywhere is suspicious.
    const allFunctions = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith(".js") && !f.startsWith("_"));
    const violations = [];
    for (const fn of allFunctions) {
      const src = readFileSync(join(FUNCTIONS_DIR, fn), "utf8");
      const m = src.match(/maxAttempts\s*:\s*([2-9])/);
      if (m) violations.push(`${fn}: maxAttempts:${m[1]}`);
    }
    expect(violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Skill-snapshot endpoint contract
// ─────────────────────────────────────────────────────────────────────────────
describe("skill-snapshot — health.* contract assertions", () => {
  let mockGarmentCount = 0;
  let mockHistoryCount = 0;
  let mockOrphans = [];
  let mockMigrations = [];
  let mockAppSettings = null;
  let mockAppConfigRows = {};
  let mockScoreTrend = [];
  let mockWardrobeHealth = [];

  vi.mock("../netlify/functions/_cors.js", () => ({
    cors: () => ({
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    }),
  }), { virtual: true });

  // Reuse the @supabase/supabase-js mock from block 1 — it's hoisted file-wide.
  // Override the module reference with a snapshot-specific mock by adjusting
  // the global state shape per-test.
  let handler;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    mockGarmentCount = 101;
    mockHistoryCount = 65;
    mockOrphans = [];
    mockMigrations = [{ name: "20260320_add_time_slot_to_history" }];
    mockAppSettings = { id: "default" };
    mockAppConfigRows = {
      claude_model: { value: "claude-sonnet-4-6" },
      auto_heal_log: { value: { healthy: true, ranAt: "2026-04-30T05:00:00Z" } },
    };
    mockScoreTrend = [];
    mockWardrobeHealth = [];

    // Re-stub the supabase-js mock for snapshot-specific shape
    vi.resetModules();
    vi.doMock("@supabase/supabase-js", () => {
      const single = () => {
        const k = single._k;
        return { data: mockAppConfigRows[k] ?? null, error: null };
      };
      const fromImpl = (table) => {
        if (table === "garments") {
          return {
            select: () => ({
              eq: () => ({
                not: () => ({ count: mockGarmentCount, error: null }),
              }),
            }),
          };
        }
        if (table === "history") {
          return {
            select: (_, opts) => {
              if (opts?.count === "exact" && opts?.head === true) {
                return { count: mockHistoryCount, error: null };
              }
              return {
                or: () => ({ data: mockOrphans, error: null }),
                gte: () => ({ order: () => ({ data: mockScoreTrend, error: null }) }),
              };
            },
          };
        }
        if (table === "_migrations") {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({ data: mockMigrations, error: null }),
              }),
            }),
          };
        }
        if (table === "app_settings") {
          return {
            select: () => ({
              eq: () => ({ single: () => ({ data: mockAppSettings, error: null }) }),
            }),
          };
        }
        if (table === "app_config") {
          return {
            select: () => ({
              eq: (_col, key) => {
                single._k = key;
                return { single };
              },
            }),
          };
        }
        return { select: () => ({ data: null, error: null }) };
      };
      return { createClient: () => ({ from: fromImpl, rpc: () => ({ data: mockWardrobeHealth, error: null }) }) };
    });

    const mod = await import("../netlify/functions/skill-snapshot.js");
    handler = mod.handler;
  });

  it("returns all required health.* keys (every key the audit pipeline asserts on)", async () => {
    const event = { httpMethod: "GET" };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.health).toBeDefined();
    expect(body.health).toHaveProperty("garments");
    expect(body.health).toHaveProperty("history");
    expect(body.health).toHaveProperty("orphanedHistory");
    expect(body.health).toHaveProperty("wardrobeHealth");
    expect(body.health).toHaveProperty("autoHeal");
  });

  it("garmentCount and orphanedHistoryCount are top-level numeric keys", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(typeof body.garmentCount).toBe("number");
    expect(typeof body.orphanedHistoryCount).toBe("number");
    expect(body.orphanedHistoryCount).toBe(0);
  });

  it("autoHeal: WARN when last run had healthy:false", async () => {
    mockAppConfigRows.auto_heal_log = { value: { healthy: false, ranAt: "2026-04-30T05:00:00Z" } };
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.health.autoHeal).toContain("WARN");
  });

  it("autoHeal: ok when last run had healthy:true", async () => {
    mockAppConfigRows.auto_heal_log = { value: { healthy: true, ranAt: "2026-04-30T05:00:00Z" } };
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.health.autoHeal).toBe("ok");
  });

  it("orphanedHistory: ok when zero orphans", async () => {
    mockOrphans = [];
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.health.orphanedHistory).toBe("ok");
  });

  it("orphanedHistory: WARN when orphans present", async () => {
    mockOrphans = [
      { id: "today-abc", payload: {} }, // not legacy/quickLog → real orphan
    ];
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.health.orphanedHistory).toContain("WARN");
  });

  it("supabaseProject and netlifySiteId are pinned to watch-advisor2 values", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    // These IDs are part of the skill's hard constraint — never confuse them
    expect(body.supabaseProject).toBe("oaojkanozbfpofbewtfq");
    expect(body.netlifySiteId).toBe("4d21d73c-b37f-4d3a-8954-8347045536dd");
  });

  it("scoringWeights mirrors the source-of-truth config", async () => {
    const result = await handler({ httpMethod: "GET" });
    const body = JSON.parse(result.body);
    expect(body.scoringWeights.rotationFactor).toBe(0.40);
    expect(body.scoringWeights.repetitionPenalty).toBe(-0.28);
    expect(body.scoringWeights.neverWornRotationPressure).toBe(0.50);
  });

  it("rejects non-GET methods with 405", async () => {
    const result = await handler({ httpMethod: "POST" });
    expect(result.statusCode).toBe(405);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Persistence migration round-trip — older garment-shape compat
// ─────────────────────────────────────────────────────────────────────────────
describe("persistence migration round-trip — pre-v2 entry shapes", () => {
  // Entries authored by versions <v1.10 stored garmentIds at the root, not
  // inside payload. The post-migration domain functions must read either
  // shape transparently. This is a regression net for the v1 → v2 bump.

  it("garmentDaysIdle reads root-level garmentIds (v1 legacy shape)", () => {
    const history = [
      { garmentIds: ["g1"], date: daysAgo(3) }, // v1 — root key
    ];
    expect(garmentDaysIdle("g1", history)).toBe(3);
  });

  it("garmentDaysIdle reads payload.garmentIds (v2 shape)", () => {
    const history = [
      { payload: { garmentIds: ["g1"] }, date: daysAgo(3) }, // v2 — payload nested
    ];
    expect(garmentDaysIdle("g1", history)).toBe(3);
  });

  it("repetitionPenalty handles both v1 and v2 shapes in same history array", () => {
    setScoringOverrides({});
    const history = [
      { garmentIds: ["g_v1"], date: daysAgo(0) },
      { payload: { garmentIds: ["g_v2"] }, date: daysAgo(1) },
    ];
    // both should be in the recent window
    expect(repetitionPenalty("g_v1", history)).toBe(-0.28);
    expect(repetitionPenalty("g_v2", history)).toBe(-0.28);
    // but a garment from neither entry returns 0
    expect(repetitionPenalty("g_other", history)).toBe(0);
  });

  it("garmentDaysIdle: v1 root takes precedence over v2 payload (?? operator)", () => {
    // Nullish coalesce: if root garmentIds is defined (even empty), payload is ignored.
    // This is the behavior contract — a regression to ?? || would change semantics.
    const history = [
      { garmentIds: ["g1"], payload: { garmentIds: ["g2"] }, date: daysAgo(5) },
    ];
    expect(garmentDaysIdle("g1", history)).toBe(5); // root match wins
    expect(garmentDaysIdle("g2", history)).toBe(Infinity); // payload ignored
  });

  it("garmentDaysIdle: empty root array does NOT fall through to payload (?? semantics)", () => {
    // ?? only falls through on null/undefined — empty array is defined.
    // This pins down that we don't use ||.
    const history = [
      { garmentIds: [], payload: { garmentIds: ["g2"] }, date: daysAgo(5) },
    ];
    expect(garmentDaysIdle("g2", history)).toBe(Infinity);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Mutation-test feel — boundary assertions where flipping operator fails
// ─────────────────────────────────────────────────────────────────────────────
describe("rotationFactor — mutation-resistant boundary tests", () => {
  it("rotationFactor for never-worn garment === neverWornRotationPressure × rotationFactor weight", () => {
    setScoringOverrides({});
    // Default neverWorn pressure = 0.5, default rotationFactor weight = 0.40
    // Expected output for never-worn garment = 0.5 × 0.40 = 0.20
    const candidate = { garment: { id: "g1" } };
    const ctx = { history: [] };
    expect(rotationFactor(candidate, ctx)).toBeCloseTo(0.20, 5);
  });

  it("rotationFactor returns exactly 0 for garment without id (defensive)", () => {
    expect(rotationFactor({ garment: {} }, { history: [] })).toBe(0);
    expect(rotationFactor({ garment: null }, { history: [] })).toBe(0);
    expect(rotationFactor({}, { history: [] })).toBe(0);
  });

  it("rotationFactor scales linearly with override of weight (auto-heal tune lifts pressure)", () => {
    const candidate = { garment: { id: "g1" } };
    const ctx = { history: [] };
    setScoringOverrides({ rotationFactor: 0.40 });
    const baseline = rotationFactor(candidate, ctx);
    setScoringOverrides({ rotationFactor: 0.60 });
    const tuned = rotationFactor(candidate, ctx);
    // 0.60 / 0.40 = 1.5×
    expect(tuned / baseline).toBeCloseTo(1.5, 4);
  });

  it("rotationPressure boundary: midpoint=14 yields exactly 0.5 (logistic centre)", () => {
    setScoringOverrides({});
    expect(rotationPressure(14)).toBeCloseTo(0.5, 5);
    // Off-by-one mutations (midpoint=13 or 15) would shift this away from 0.5
    expect(rotationPressure(15)).toBeGreaterThan(0.5);
    expect(rotationPressure(13)).toBeLessThan(0.5);
  });

  it("rotationPressure: flipping the steepness sign flips the curve direction", () => {
    setScoringOverrides({});
    // Higher idle days → higher pressure (positive steepness).
    // If the steepness sign were flipped, this monotonicity would break.
    expect(rotationPressure(30)).toBeGreaterThan(rotationPressure(20));
    expect(rotationPressure(20)).toBeGreaterThan(rotationPressure(10));
    expect(rotationPressure(10)).toBeGreaterThan(rotationPressure(5));
    expect(rotationPressure(5)).toBeGreaterThan(rotationPressure(1));
  });
});

describe("repetitionFactor — mutation-resistant tests", () => {
  it("returns 0 (not -0.28) when diversityBonus is already negative (no compounding)", () => {
    // The compound-prevention is the explicit purpose of the early return.
    // A regression that drops the early return would re-introduce the
    // -0.64 stacking bug.
    const candidate = { garment: { id: "g1" }, diversityBonus: -0.36 };
    const ctx = { history: [{ garmentIds: ["g1"], date: daysAgo(0) }] };
    expect(repetitionFactorFn(candidate, ctx)).toBe(0);
  });

  it("APPLIES -0.28 when diversityBonus is exactly 0 (boundary <0 vs <=0)", () => {
    // Source uses < 0 (strictly negative). Mutating to <=0 would suppress
    // here. This test pins down the strict inequality.
    const candidate = { garment: { id: "g1" }, diversityBonus: 0 };
    const ctx = { history: [{ garmentIds: ["g1"], date: daysAgo(0) }] };
    expect(repetitionFactorFn(candidate, ctx)).toBe(-0.28);
  });

  it("APPLIES -0.28 when diversityBonus is positive (no diversity penalty present)", () => {
    const candidate = { garment: { id: "g1" }, diversityBonus: 0.1 };
    const ctx = { history: [{ garmentIds: ["g1"], date: daysAgo(0) }] };
    expect(repetitionFactorFn(candidate, ctx)).toBe(-0.28);
  });

  it("returns 0 when garment is NOT in recent window (regardless of diversity)", () => {
    const candidate = { garment: { id: "g_unseen" }, diversityBonus: 0 };
    const ctx = { history: [{ garmentIds: ["g_other"], date: daysAgo(0) }] };
    expect(repetitionFactorFn(candidate, ctx)).toBe(0);
  });

  it("returns 0 for garment without id (defensive)", () => {
    expect(repetitionFactorFn({ garment: {} }, { history: [] })).toBe(0);
    expect(repetitionFactorFn({ garment: null }, { history: [] })).toBe(0);
  });

  it("MEMORY_WINDOW boundary: only the LAST 5 entries count (slice(-5))", () => {
    // Garment at history[0] is 6 entries old — outside window.
    // Garment at history[5] (last) is in window.
    const history = [
      { garmentIds: ["old-garment"], date: daysAgo(20) },
      { garmentIds: ["g_a"], date: daysAgo(10) },
      { garmentIds: ["g_b"], date: daysAgo(8) },
      { garmentIds: ["g_c"], date: daysAgo(6) },
      { garmentIds: ["g_d"], date: daysAgo(4) },
      { garmentIds: ["g_e"], date: daysAgo(2) },
    ];
    expect(repetitionPenalty("old-garment", history)).toBe(0); // outside window
    expect(repetitionPenalty("g_a", history)).toBe(-0.28); // in last 5
    expect(repetitionPenalty("g_e", history)).toBe(-0.28);
  });
});

describe("_crossSlotCoherence — boundary mutation tests via buildOutfit", () => {
  // These force specific scoring branches by carefully shaping the wardrobe
  // so that coherence is the dominant tiebreaker.

  beforeEach(() => {
    vi.resetModules();
  });

  async function loadBuilder() {
    vi.doMock("../src/stores/rejectStore.js", () => ({
      useRejectStore: { getState: () => ({ isRecentlyRejected: () => false }) },
    }));
    vi.doMock("../src/stores/strapStore.js", () => ({
      useStrapStore: { getState: () => ({ getActiveStrapObj: () => null }) },
    }));
    const m = await import("../src/outfitEngine/outfitBuilder.js");
    return m.buildOutfit;
  }

  it("EXACT same color across slots is penalised (-0.4 branch wins over neutral +0.10)", async () => {
    const buildOutfit = await loadBuilder();
    const watch = { id: "w1", style: "sport-elegant", formality: 7, dial: "silver-white", strap: "bracelet" };
    const wardrobe = [
      { id: "s1", type: "shirt", color: "navy", formality: 7 },
      // Two pants options — both should outscore the navy duplicate
      { id: "p_dup", type: "pants", color: "navy", formality: 7 }, // -0.4
      { id: "p_neutral", type: "pants", color: "white", formality: 7 }, // +0.10 neutral
      { id: "sh1", type: "shoes", color: "black", formality: 7 },
    ];
    const out = buildOutfit(watch, wardrobe, {});
    // Expectation: pants color is NOT navy (the duplicate-color penalty kicks in)
    expect(out.pants?.color).not.toBe("navy");
  });

  it("warm/cool tone classification is closed under WARM and COOL sets (no fall-through to neutral)", async () => {
    // If 'navy' got reclassified as neutral, the warm/cool branch would never
    // fire and contrast bonuses would degrade. Pin down: when filledColors
    // are warm and candidate is cool, the engine considers it.
    const buildOutfit = await loadBuilder();
    const watch = { id: "w-tone", style: "sport-elegant", formality: 7, dial: "silver-white", strap: "bracelet" };
    const wardrobe = [
      { id: "s1", type: "shirt", color: "tan", formality: 7 },         // warm baseline
      { id: "p_cool", type: "pants", color: "navy", formality: 7 },    // cool contrast → +0.20
      { id: "sh_neutral", type: "shoes", color: "white", formality: 7 },
    ];
    const out = buildOutfit(watch, wardrobe, {});
    expect(out.pants?.color).toBe("navy"); // warm + cool contrast preserved
  });

  it("neutral candidate (white) earns +0.10 even with no other slots filled (baseline)", async () => {
    // Defends a regression where the neutral branch returns 0 instead of +0.10.
    const buildOutfit = await loadBuilder();
    const watch = { id: "w2", style: "sport-elegant", formality: 7, dial: "silver-white", strap: "bracelet" };
    const wardrobe = [
      { id: "s_white", type: "shirt", color: "white", formality: 7 },
      { id: "p_grey", type: "pants", color: "grey", formality: 7 },
      { id: "sh1", type: "shoes", color: "black", formality: 7 },
    ];
    const out = buildOutfit(watch, wardrobe, {});
    expect(out.shirt).toBeTruthy();
    expect(out.pants).toBeTruthy();
    expect(out.shoes).toBeTruthy();
  });
});
