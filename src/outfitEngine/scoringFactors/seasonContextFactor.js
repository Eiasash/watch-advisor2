/**
 * Season + context scoring factor.
 *
 * Garments tagged via BulkTaggerPanel carry:
 *   garment.seasons  — e.g. ["spring","autumn","all-season"]
 *   garment.contexts — e.g. ["clinic","smart-casual"]
 *
 * This factor:
 *   - Rewards garments whose season tag matches the current season (+0.3)
 *   - Soft-penalises out-of-season garments that aren't "all-season" (-0.2)
 *   - Rewards garments whose context tag matches the outfit context (+0.10)
 *   - Does nothing for untagged garments (0) — neutral, no false negatives
 *
 * Max contribution: +0.40 (in-season + right context)
 * Max penalty: -0.2 (wrong season only; context mismatch is silent)
 */

const SEASON_BY_MONTH = {
  0:"winter", 1:"winter", 2:"spring",
  3:"spring", 4:"spring", 5:"summer",
  6:"summer", 7:"summer", 8:"autumn",
  9:"autumn", 10:"autumn", 11:"winter",
};

export function currentSeason() {
  // Use Jerusalem timezone so the season is correct regardless of server/client UTC offset.
  const month = parseInt(
    new Date().toLocaleDateString("en-US", { month: "numeric", timeZone: "Asia/Jerusalem" }),
    10
  ) - 1; // toLocaleDateString month is 1-indexed
  return SEASON_BY_MONTH[month];
}

// Late-month transition: in the last month of each season, the upcoming season
// gets a small bonus instead of a penalty. E.g. April (late spring) → summer
// garments score slightly positive instead of -0.15.
const TRANSITION_MONTHS = { 4: "summer", 7: "autumn", 10: "winter", 1: "spring" };
export function transitionSeason() {
  const month = parseInt(
    new Date().toLocaleDateString("en-US", { month: "numeric", timeZone: "Asia/Jerusalem" }),
    10
  ) - 1;
  return TRANSITION_MONTHS[month] ?? null;
}

export default function seasonContextFactor(candidate, context) {
  const { garment } = candidate;
  if (!garment) return 0;

  const seasons  = garment.seasons  ?? [];
  const contexts = garment.contexts ?? [];
  let score = 0;

  // ── Season ─────────────────────────────────────────────────────────────────
  if (seasons.length > 0) {
    // Allow tests to inject season via context._season to avoid Date mocking
    const season = context._season ?? currentSeason();
    // Handle both "all-season" and legacy "all" tag from bulk tagger
    if (seasons.includes("all-season") || seasons.includes("all")) {
      // Neutral — no bonus, no penalty
    } else if (seasons.includes(season)) {
      score += 0.3;
    } else {
      // Check for season transition: late spring → summer garments get a small bonus
      const transition = context._transitionSeason ?? transitionSeason();
      if (transition && seasons.includes(transition)) {
        score += 0.10; // mild bonus for upcoming season
      } else {
      // Check if garment is tagged for the OPPOSITE season (summer↔winter, spring↔autumn).
      // Opposite-season items get a much stronger penalty (-0.8) to effectively eliminate them
      // from selection, while adjacent-season items keep the mild -0.2 penalty.
      const OPPOSITE = { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" };
      const ADJACENT = { winter: new Set(["autumn", "spring"]), summer: new Set(["spring", "autumn"]),
                         spring: new Set(["winter", "summer"]), autumn: new Set(["summer", "winter"]) };
      const opposite = OPPOSITE[season];
      const adjacent = ADJACENT[season] ?? new Set();
      const hasAdjacent = seasons.some(s => adjacent.has(s));
      const isOnlyOpposite = seasons.length === 1 && seasons[0] === opposite;
      score -= isOnlyOpposite ? 0.8 : (hasAdjacent ? 0.15 : 0.2);
      }
    }
  }

  // ── Context ────────────────────────────────────────────────────────────────
  // Soft bonus — context is a nudge, not a gate. Reduced from 0.25 to 0.10.
  if (contexts.length > 0 && context.outfitContext) {
    if (contexts.includes(context.outfitContext)) {
      score += 0.10;
    }
  }

  return score;
}
