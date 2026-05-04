/**
 * Config-policy regression guard for netlify/functions/daily-pick.js.
 *
 * Why this test exists:
 *   PR #142 (2026-05-04) reverted daily-pick from Haiku 4.5 + 800 tokens
 *   back to Sonnet 4.6 + adaptive thinking + effort:high + 2200 tokens.
 *   This produced live HTTP 504 timeouts in production within minutes
 *   (debug log showed two consecutive WeekPlanner auto-load calls 31s
 *   apart, both 504 "Inactivity Timeout"). PR #143 rolled back.
 *
 * The fix that prevents this happening AGAIN is not "be more careful" —
 * it's a static assertion on the inference config so any future PR that
 * tries the same thing fails CI before merge.
 *
 * If you're here because this test failed: read the comment block in
 * daily-pick.js around the FAST_MODEL constant before changing the
 * assertions. The latency budget on this Netlify region is ~30s edge-
 * proxy ceiling regardless of plan tier; Sonnet+thinking+2200 doesn't
 * fit. To re-attempt Sonnet, do it gradually (effort:medium first, no
 * thinking, max_tokens 1500) and update this test to match.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(
  join(__dirname, "..", "netlify", "functions", "daily-pick.js"),
  "utf8"
);

describe("daily-pick inference config policy", () => {
  it("uses Haiku 4.5 (not Sonnet/Opus) — Sonnet+thinking+2200 caused live 504s in PR #142", () => {
    expect(SOURCE).toContain("claude-haiku-4-5-20251001");
    // Defensive: ensure we're not silently using getConfiguredModel() (which
    // could resolve to Sonnet via app_config and recreate the #142 incident).
    // The CALL site to callClaude must reference the hardcoded constant.
    const callMatch = SOURCE.match(/await callClaude\([^)]*?\{[\s\S]*?model:\s*([^,]+),/);
    expect(callMatch, "couldn't find callClaude({ model: ... } in daily-pick.js").toBeTruthy();
    const modelArg = callMatch[1].trim();
    expect(
      modelArg === "FAST_MODEL" || modelArg === '"claude-haiku-4-5-20251001"',
      `daily-pick model arg is "${modelArg}" — expected FAST_MODEL or hardcoded haiku string`,
    ).toBe(true);
  });

  it("max_tokens cap ≤ 800 for single picks (PR #143 rollback baseline)", () => {
    // The maxTokens line in daily-pick.js. Look for the variant calc.
    const match = SOURCE.match(/const maxTokens = variants > 1 \? (\d+)[^:]+:\s*(\d+);/);
    expect(match, "couldn't find maxTokens calc in daily-pick.js").toBeTruthy();
    const variantBase = parseInt(match[1], 10);
    const single = parseInt(match[2], 10);
    expect(single, "single-pick max_tokens").toBeLessThanOrEqual(800);
    expect(variantBase, "variant base max_tokens").toBeLessThanOrEqual(2000);
  });

  it("does NOT pass thinking: { type: \"adaptive\" } to callClaude — banned from interactive path", () => {
    // adaptive thinking is a known latency-blower for daily-pick. Allowed for
    // offline/audit functions, NOT for interactive request path.
    const callBlock = SOURCE.match(/await callClaude\(apiKey, \{[\s\S]*?\}, \{ maxAttempts: 1 \}\);/);
    expect(callBlock, "couldn't find callClaude block").toBeTruthy();
    expect(callBlock[0]).not.toContain("thinking:");
    expect(callBlock[0]).not.toContain('type: "adaptive"');
  });

  it("does NOT pass output_config to callClaude — Haiku rejects it (PR #132)", () => {
    const callBlock = SOURCE.match(/await callClaude\(apiKey, \{[\s\S]*?\}, \{ maxAttempts: 1 \}\);/);
    expect(callBlock, "couldn't find callClaude block").toBeTruthy();
    expect(callBlock[0]).not.toContain("output_config");
    expect(callBlock[0]).not.toContain('effort:');
  });

  it("uses maxAttempts: 1 (no retry on the interactive path)", () => {
    // Retries multiply latency. For interactive functions the user can hit
    // regen themselves; we shouldn't burn the budget waiting for retries.
    expect(SOURCE).toContain("maxAttempts: 1");
  });
});
