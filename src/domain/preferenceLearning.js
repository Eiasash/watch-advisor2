/**
 * preferenceLearning — derive small scoring adjustments from wear history.
 *
 * Pure domain function. No React, Zustand, IDB, or Supabase.
 * Operates on plain history entry arrays.
 *
 * History entries store `context` (e.g. "formal", "casual", "smart-casual").
 * The function maps context → formality bucket to derive preference weights.
 */

const FORMAL_CONTEXTS = new Set(["formal", "clinic", "hospital-smart-casual", "shift", "date-night"]);
const CASUAL_CONTEXTS = new Set(["casual", "riviera"]);

/**
 * Derive additive scoring weight adjustments from historical context choices.
 *
 * The returned weights are multipliers applied on top of 1.0:
 *   - weights.formality > 1 → lean toward formal garments
 *   - weights.formality < 1 → lean toward casual garments
 *   - Clamped to [0.85, 1.30] so preference never overrides hard scoring gates
 *
 * @param {Array} history — historyStore entries
 * @returns {{ formality: number, color: number, watchMatch: number }}
 */
export function learnPreferenceWeights(history) {
  const weights = {
    formality:  1,
    color:      1,
    watchMatch: 1,
  };

  if (!Array.isArray(history) || history.length === 0) return weights;

  let casual = 0;
  let formal = 0;

  for (const entry of history) {
    // Support both entry.formality (spec field) and entry.context (actual stored field)
    const bucket = entry.formality ?? entry.context ?? "";
    if (FORMAL_CONTEXTS.has(bucket) || bucket === "formal") formal++;
    else if (CASUAL_CONTEXTS.has(bucket) || bucket === "casual") casual++;
  }

  const total = casual + formal;
  if (total === 0) return weights;

  // Lean toward formality when most logs are formal, toward casual otherwise.
  // Range: 0.85 (all casual) → 1.30 (all formal). Neutral at 50/50.
  const formalRatio = formal / total;
  weights.formality = 0.85 + formalRatio * 0.45;

  return weights;
}
