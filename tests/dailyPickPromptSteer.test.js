/**
 * Regression guard for the v1.13.44 STEER_INSTRUCTIONS hardening.
 *
 * Bug (companion to v1.13.43 diversity-escape fix):
 *   Original steer text used soft verbs:
 *     more_formal: "push toward dress shirts/leather shoes/dressier watches"
 *     more_casual: "relax formality, prefer t-shirts/sneakers/casual watches"
 *   Soft verbs let Claude trade off against competing signals — when the
 *   user pinned a high-formality watch + casual context, "More formal"
 *   produced cobalt-blue polos (formality 5) because color-match overrode
 *   the soft formality nudge.
 *
 * Fix:
 *   Each formality steer is now bound to a hard numeric threshold:
 *     more_formal: every chosen garment must have formality ≥ 6
 *     more_casual: every chosen garment must have formality ≤ 5
 *   Plus explicit wardrobe-availability fallback so Claude doesn't freeze
 *   when no candidate meets the floor (it picks the closest available and
 *   calls it out in the reasoning).
 *
 * What this test asserts:
 *   1. more_formal contains "formality ≥ 6" and the word "Reject" with
 *      "≤ 5" — both the floor and the negative space.
 *   2. more_casual contains "formality ≤ 5" and "Reject" with "≥ 6".
 *   3. Both contain "HARD CONSTRAINT" so the directive language stays
 *      distinct from soft prose suggestions elsewhere in the prompt.
 *   4. Both contain fallback language ("rare", "call it out") so an empty
 *      wardrobe tier doesn't produce a refusal.
 *   5. different_watch is unchanged — it isn't a formality steer.
 *   6. When a steer is sent in buildUserPrompt args, the FLEXIBILITY
 *      DIRECTIVE line carries the new hard-constraint text verbatim into
 *      the final prompt.
 *
 * If this test fails, the soft verbs are back and the stuck-loop bug
 * resurrects in any scenario where formality and color-match disagree.
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

const baseWeather = { tempC: 22, tempMorning: 22, tempMidday: 27, tempEvening: 24, description: "clear" };

function buildArgs(overrides = {}) {
  return {
    todayStr: "2026-05-11",
    weather: baseWeather,
    garmentList: "(test wardrobe list)",
    garments: [],
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

describe("daily-pick.js STEER_INSTRUCTIONS hardening (v1.13.44)", () => {
  // Source-level assertions — these guard the constants directly, so a
  // refactor that moves the strings can't accidentally soften them.
  describe("source-level constant assertions", () => {
    it("more_formal binds to formality ≥ 6 with explicit floor", () => {
      // Source-string match: both the floor and the negative space must
      // be present. The unicode ≥ is intentional — it survives JSON
      // serialization and reads cleanly in the prompt.
      const match = dailyPickSource.match(/more_formal:\s*"([^"]+)"/);
      expect(match).not.toBeNull();
      const text = match[1];
      expect(text).toContain("HARD CONSTRAINT");
      expect(text).toContain("formality ≥ 6");
      expect(text).toContain("formality ≤ 5");
      expect(text).toMatch(/Reject .*polos/i);
      // Fallback language so the AI doesn't fail when no garment hits the floor
      expect(text).toMatch(/rare/i);
    });

    it("more_casual binds to formality ≤ 5 with explicit ceiling", () => {
      const match = dailyPickSource.match(/more_casual:\s*"([^"]+)"/);
      expect(match).not.toBeNull();
      const text = match[1];
      expect(text).toContain("HARD CONSTRAINT");
      expect(text).toContain("formality ≤ 5");
      expect(text).toContain("formality ≥ 6");
      expect(text).toMatch(/Reject .*dress shirts/i);
      expect(text).toMatch(/rare/i);
    });

    it("different_watch is unchanged — it isn't a formality steer", () => {
      const match = dailyPickSource.match(/different_watch:\s*"([^"]+)"/);
      expect(match).not.toBeNull();
      const text = match[1];
      // No formality threshold language on different_watch
      expect(text).not.toContain("HARD CONSTRAINT");
      expect(text).not.toMatch(/formality\s*[≥≤<>]/);
      // But it must still announce the intent
      expect(text).toMatch(/DIFFERENT WATCH/);
    });
  });

  // Behavioral assertions — verify the steer text reaches the final prompt
  // when handleAskClaude sends steer:"more_formal" / "more_casual".
  describe("propagation into final prompt", () => {
    it("steer=more_formal threads hard constraint into FLEXIBILITY DIRECTIVE", () => {
      const prompt = buildUserPrompt(buildArgs({ steer: "more_formal" }));
      expect(prompt).toContain("FLEXIBILITY DIRECTIVE");
      expect(prompt).toContain("HARD CONSTRAINT");
      expect(prompt).toContain("formality ≥ 6");
    });

    it("steer=more_casual threads hard constraint into FLEXIBILITY DIRECTIVE", () => {
      const prompt = buildUserPrompt(buildArgs({ steer: "more_casual" }));
      expect(prompt).toContain("FLEXIBILITY DIRECTIVE");
      expect(prompt).toContain("HARD CONSTRAINT");
      expect(prompt).toContain("formality ≤ 5");
    });

    it("steer=different_watch does NOT inject formality threshold text", () => {
      const prompt = buildUserPrompt(buildArgs({ steer: "different_watch" }));
      expect(prompt).toContain("FLEXIBILITY DIRECTIVE");
      expect(prompt).toContain("DIFFERENT WATCH");
      // The formality-threshold strings belong only to more_formal/more_casual
      expect(prompt).not.toContain("HARD CONSTRAINT");
    });

    it("no steer → no FLEXIBILITY DIRECTIVE line at all", () => {
      const prompt = buildUserPrompt(buildArgs({ steer: null }));
      expect(prompt).not.toContain("FLEXIBILITY DIRECTIVE");
    });

    it("unknown steer value → no FLEXIBILITY DIRECTIVE (silent ignore, no crash)", () => {
      // STEER_INSTRUCTIONS only has 3 keys; anything else is filtered out.
      const prompt = buildUserPrompt(buildArgs({ steer: "make_it_purple" }));
      expect(prompt).not.toContain("FLEXIBILITY DIRECTIVE");
    });
  });

  // Composition with v1.13.43 DIVERSITY ENFORCEMENT — both directives
  // should be able to appear simultaneously when the user is in a stuck
  // loop AND clicks More formal. The diversity block focuses on shirt
  // color, the steer block focuses on garment formality — different axes,
  // no conflict.
  describe("composition with DIVERSITY ENFORCEMENT (v1.13.43)", () => {
    const cobaltPolo = { id: "cobalt-polo", name: "Cobalt Polo", color: "cobalt-blue", formality: 5 };
    const cobaltTee  = { id: "cobalt-tee",  name: "Cobalt Tee",  color: "cobalt-blue", formality: 3 };

    it("steer=more_formal + same-color exclude → BOTH directives present", () => {
      const prompt = buildUserPrompt(buildArgs({
        steer: "more_formal",
        garments: [cobaltPolo, cobaltTee],
        excludeRecent: [
          { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
          { watch: "Reverso", shirt: cobaltTee.id,  pants: "khaki", shoes: "black" },
        ],
      }));
      // Steer hardening
      expect(prompt).toContain("FLEXIBILITY DIRECTIVE");
      expect(prompt).toContain("formality ≥ 6");
      // Diversity enforcement
      expect(prompt).toContain("DIVERSITY ENFORCEMENT");
      expect(prompt).toContain("cobalt-blue");
    });

    it("steer=more_casual + same-color exclude → BOTH directives present", () => {
      const prompt = buildUserPrompt(buildArgs({
        steer: "more_casual",
        garments: [cobaltPolo, cobaltTee],
        excludeRecent: [
          { watch: "Reverso", shirt: cobaltPolo.id, pants: "navy",  shoes: "brown" },
          { watch: "Reverso", shirt: cobaltTee.id,  pants: "khaki", shoes: "black" },
        ],
      }));
      expect(prompt).toContain("FLEXIBILITY DIRECTIVE");
      expect(prompt).toContain("formality ≤ 5");
      expect(prompt).toContain("DIVERSITY ENFORCEMENT");
    });
  });
});
