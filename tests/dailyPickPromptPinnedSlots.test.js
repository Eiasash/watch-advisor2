/**
 * Regression guard for the v1.13.13 hotfix (commit bc95721).
 *
 * Before v1.13.13 the daily-pick.js prompt accepted a `pinnedWatch` block
 * but had NO analogous block for user-pinned garments. WeekPlanner sent
 * `pinnedSlots` in the body but the prompt never instructed the model to
 * honor those slots, so "Try another" replaced the user's manual sweater
 * pick with whatever Claude chose. v1.13.13 added a CURRENT-DAY USER PICKS
 * block that names each pinned slot and tells Claude to KEEP them exactly,
 * refitting only the other slots.
 *
 * IMPROVEMENTS.md v1.13.5 listed this as an open follow-up; the v1.13.13
 * hotfix landed but neither IMPROVEMENTS.md nor two stale comments in
 * WeekPlanner.jsx were updated, so the gap appeared open in audits long
 * after it was closed (v1.13.38 audit caught the doc drift).
 *
 * This test reads the daily-pick.js source and asserts:
 *   1. `buildUserPrompt` destructures `pinnedSlots`
 *   2. The prompt template contains the literal CURRENT-DAY USER PICKS heading
 *   3. The instruction tokens "KEEP THEM EXACTLY" and "refit the other slots"
 *      are present (these are the words Claude actually obeys)
 *   4. The block is conditionally inserted (only when pinnedSlots is non-empty)
 *   5. The pinnedSlotsBlock is interpolated into the final prompt template
 *
 * If you remove or rename the prompt block, this test fails until you update
 * it deliberately. That's the whole point — accidental removal would silently
 * break user pin behavior again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dailyPickSource = readFileSync(
  resolve(__dirname, "../netlify/functions/daily-pick.js"),
  "utf8"
);

describe("daily-pick.js pinnedSlots prompt block (v1.13.13 hotfix lock-in)", () => {
  it("buildUserPrompt destructures pinnedSlots from its parameters", () => {
    // Match the function signature line — pinnedSlots must be one of the
    // destructured params alongside pinnedWatch, availableWatches, etc.
    const sigMatch = dailyPickSource.match(/function buildUserPrompt\s*\(\s*\{([^}]+)\}\s*\)/);
    expect(sigMatch, "buildUserPrompt({...}) signature should be present").toBeTruthy();
    const params = sigMatch[1];
    expect(params).toMatch(/\bpinnedSlots\b/);
  });

  it("contains the CURRENT-DAY USER PICKS heading", () => {
    expect(dailyPickSource).toContain("CURRENT-DAY USER PICKS");
  });

  it("instructs Claude to KEEP pinned slots and refit the others", () => {
    // These two tokens are the actual instruction Claude obeys. If a future
    // edit softens the language ("preferably keep" or "consider keeping"),
    // this test fails so the change is deliberate, not silent drift.
    expect(dailyPickSource).toMatch(/KEEP\s+THEM\s+EXACTLY/);
    expect(dailyPickSource).toMatch(/refit\s+the\s+other\s+slots\s+around\s+them/);
  });

  it("forbids alternative suggestions for pinned slots", () => {
    // The third instruction token: prevent Claude from listing alternates
    // in the reasoning prose (which would still "feel like" a replacement).
    expect(dailyPickSource).toMatch(/Do\s+NOT\s+suggest\s+alternatives\s+for\s+the\s+pinned\s+slots/);
  });

  it("only emits the block when pinnedSlots is a non-empty object", () => {
    // The block must be guarded — empty/missing pinnedSlots means no extra
    // prompt section. Look for the typeof check + the .length guard.
    expect(dailyPickSource).toMatch(/pinnedSlots\s*&&\s*typeof\s+pinnedSlots\s*===\s*["']object["']/);
    // The lines.length > 0 guard prevents an empty header from being emitted
    expect(dailyPickSource).toMatch(/lines\.length\s*>\s*0/);
  });

  it("interpolates pinnedSlotsBlock into the final user prompt template", () => {
    // The block must actually reach the prompt — building the string but
    // never interpolating it would silently drop the instruction.
    expect(dailyPickSource).toMatch(/\$\{[^}]*pinnedSlotsBlock[^}]*\}/);
  });
});
