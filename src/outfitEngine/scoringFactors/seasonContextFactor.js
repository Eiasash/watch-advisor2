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
 *   - Rewards garments whose context tag matches the outfit context (+0.25)
 *   - Does nothing for untagged garments (0) — neutral, no false negatives
 *
 * Max contribution: +0.55 (in-season + right context)
 * Max penalty: -0.2 (wrong season only; context mismatch is silent)
 */

const SEASON_BY_MONTH = {
  0:"winter", 1:"winter", 2:"spring",
  3:"spring", 4:"spring", 5:"summer",
  6:"summer", 7:"summer", 8:"autumn",
  9:"autumn", 10:"autumn", 11:"winter",
};

export function currentSeason() {
  return SEASON_BY_MONTH[new Date().getMonth()];
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
    if (seasons.includes("all-season")) {
      // Neutral — no bonus, no penalty
    } else if (seasons.includes(season)) {
      score += 0.3;
    } else {
      score -= 0.2;
    }
  }

  // ── Context ────────────────────────────────────────────────────────────────
  if (contexts.length > 0 && context.outfitContext) {
    if (contexts.includes(context.outfitContext)) {
      score += 0.25;
    }
  }

  return score;
}
