/**
 * Regression guard for the v1.13.43 DIVERSITY ENFORCEMENT block.
 *
 * Bug (root cause: 2026-05-10 stuck-loop session):
 *   User pinned JLC Reverso, set context=Casual, clicked
 *   "Different one" / "Try another" / "More casual" / "More formal"
 *   ~5 times. Every reroll returned the SAME shirt color (cobalt-blue)
 *   because:
 *     1. NEWLY ADDED prompt section says "strongly prefer" recently-uploaded
 *        garments. Two cobalt-blue shirts (Pierre Cardin Polo + TH Tee) were
 *        added May 3, both never-worn, so both were always in the priority list.
 *     2. Cobalt-blue color-matched Reverso's navy dial → high pair score.
 *     3. The exclude block listed prior outfits but Claude swapped Polo↔Tee
 *        and considered that "different" — different garment id, identical
 *        perceived color.
 *   The user's complaint: "App is broken not generating nothing" — the
 *   variation buttons felt inert.
 *
 * Fix:
 *   When ≥2 entries in excludeRecent share a shirt color (resolved via the
 *   garments lookup the prompt already has on hand), inject a DIVERSITY
 *   ENFORCEMENT block that calls out the over-used colors and instructs
 *   Claude to pick a different color family for the shirt slot — explicitly
 *   overriding "strongly prefer NEWLY ADDED" for that one slot, that one turn.
 *
 * What this test asserts:
 *   1. No exclude → no diversity block (zero impact on first-time picks).
 *   2. 1 exclude → no diversity block (need ≥2 to detect a pattern).
 *   3. 2 excludes, different shirt colors → no diversity block (no repetition yet).
 *   4. 2 excludes, same shirt color → DIVERSITY ENFORCEMENT block names that color.
 *   5. 3 excludes mixing two colors that each repeat → both colors named.
 *   6. The block is positioned between excludeBlock and rejectedBlock in the
 *      final prompt template (source-string assertion, matches the existing
 *      pinnedSlots regression-guard pattern).
 *
 * If this test fails, accidental removal would resurrect the stuck-loop bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildUserPrompt } from "../netlify/functions/daily-pick.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dailyPickSource = readFileSync(
  resolve(__dirname, "../netlify/functions/daily-pick.js"),
  "utf8"
);

// Minimal scaffolding so buildUserPrompt has the args it destructures.
const baseWeather = { tempC: 22, tempMorning: 22, tempMidday: 27, tempEvening: 24, description: "clear" };

const cobaltPolo = { id: "g_summer_cobalt_polo_pc", name: "Pierre Cardin Cobalt Blue Polo", type: "shirt", color: "cobalt-blue", formality: 5 };
const cobaltTee  = { id: "g_summer_cobalt_tee_th",  name: "Tommy Hilfiger Cobalt Blue Tee",   type: "shirt", color: "cobalt-blue", formality: 3 };
const oliveTee   = { id: "g_summer_olive_tee_th",   name: "Tommy Hilfiger Olive Tee",         type: "shirt", color: "olive",       formality: 3 };
const navyTee    = { id: "g_summer_navy_tee_lc",    name: "Lee Cooper Navy Tee",              type: "shirt", color: "navy",        formality: 3 };

const wardrobe = [cobaltPolo, cobaltTee, oliveTee, navyTee];

function buildArgs(overrides = {}) {
  return {
    todayStr: "2026-05-11",
    weather: baseWeather,
    garmentList: "(test wardrobe list)",
    garments: wardrobe,
    recentWatches: "",
    recentGarments: "",
    steer: null,
    excludeRecent: [],
    rejected: null,
    pastCorrections: [],
    variants: 1,
    personalization: null,
    recentRejections: [],
    pinnedWatch: null,
    availableWatches: null,
    pinnedSlots: null,
    ...overrides,
  };
}

describe("daily-pick.js DIVERSITY ENFORCEMENT block (v1.13.43)", () => {
  it("no excludeRecent → no diversity block", () => {
    const prompt = buildUserPrompt(buildArgs({ excludeRecent: [] }));
    expect(prompt).not.toContain("DIVERSITY ENFORCEMENT");
  });

  it("one excludeRecent entry → no diversity block (insufficient evidence)", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: [
        { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy", shoes: "brown" },
      ],
    }));
    expect(prompt).not.toContain("DIVERSITY ENFORCEMENT");
  });

  it("two excludeRecent entries with DIFFERENT shirt colors → no diversity block", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: [
        { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: oliveTee.id,   pants: "khaki", shoes: "black" },
      ],
    }));
    expect(prompt).not.toContain("DIVERSITY ENFORCEMENT");
  });

  it("two excludeRecent entries with SAME shirt color → diversity block names that color", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: [
        { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: cobaltTee.id,  pants: "khaki", shoes: "black" },
      ],
    }));
    expect(prompt).toContain("DIVERSITY ENFORCEMENT");
    expect(prompt).toContain("cobalt-blue");
    // The instruction must override "strongly prefer NEWLY ADDED" — that's
    // the whole point of the fix.
    expect(prompt).toContain("Variety beats freshness");
  });

  it("works when shirt is sent as a NAME (not an id) — AI sometimes returns names", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: [
        { watch: "Reverso", shirt: "Pierre Cardin Cobalt Blue Polo", pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: "Tommy Hilfiger Cobalt Blue Tee", pants: "khaki", shoes: "black" },
      ],
    }));
    expect(prompt).toContain("DIVERSITY ENFORCEMENT");
    expect(prompt).toContain("cobalt-blue");
  });

  it("three entries, two colors each repeating → both colors named", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: [
        { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: cobaltTee.id,  pants: "khaki", shoes: "black" },
        { watch: "Reverso", shirt: oliveTee.id,   pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: oliveTee.id,   pants: "khaki", shoes: "black" },
      ],
    }));
    expect(prompt).toContain("DIVERSITY ENFORCEMENT");
    expect(prompt).toContain("cobalt-blue");
    expect(prompt).toContain("olive");
  });

  it("falls back gracefully when garments list is empty (no crash, no block)", () => {
    const prompt = buildUserPrompt(buildArgs({
      garments: [],
      excludeRecent: [
        { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
        { watch: "Reverso", shirt: cobaltTee.id,  pants: "khaki", shoes: "black" },
      ],
    }));
    expect(prompt).not.toContain("DIVERSITY ENFORCEMENT");
  });

  it("string-form excludeRecent entries are ignored (legacy shape, no shirt key)", () => {
    const prompt = buildUserPrompt(buildArgs({
      excludeRecent: ["Reverso + something + navy + brown", "Reverso + something else"],
    }));
    expect(prompt).not.toContain("DIVERSITY ENFORCEMENT");
  });

  it("source positions colorRotationBlock between excludeBlock and rejectedBlock", () => {
    // The DIVERSITY ENFORCEMENT directive logically belongs adjacent to the
    // "DO NOT REPEAT" list — same conversational thread. If a future refactor
    // moves it after personalization, the block lands far from its referent
    // and Claude's instruction-following weakens. Lock the position.
    const finalTemplate = dailyPickSource.match(
      /steerLine\}\$\{pinnedWatchBlock\}.*?personalizationBlock\}/s
    );
    expect(finalTemplate).not.toBeNull();
    const tpl = finalTemplate[0];
    const exIdx  = tpl.indexOf("excludeBlock");
    const colIdx = tpl.indexOf("colorRotationBlock");
    const rejIdx = tpl.indexOf("rejectedBlock");
    expect(exIdx).toBeGreaterThanOrEqual(0);
    expect(colIdx).toBeGreaterThan(exIdx);
    expect(rejIdx).toBeGreaterThan(colIdx);
  });
});
