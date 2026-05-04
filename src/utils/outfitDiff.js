/**
 * Compute the difference between two outfit picks — used to render a
 * "Changed: X. Kept: Y." banner after the user clicks "Different one"
 * (regenerate). The banner exists because outfit changes are multi-part
 * and humans are bad at spotting which slots changed by visual diff alone.
 *
 * Inputs are the compact pick projections from compactPickForExclude:
 *   { watch, watchId, shirt, sweater, pants, shoes, jacket }
 *
 * "watchId" is the canonical comparison key for watches; "watch" is just
 * the human-readable name. Diff on watchId, label as "watch".
 *
 * Returns { changed, kept } where each is an array of slot labels.
 *   - changed: slot was different between prev and next (incl. null transitions)
 *   - kept:    slot was identical AND non-null in both
 *
 * Slots that are null in both are omitted (no signal there).
 */

const COMPARABLE_SLOTS = [
  { key: "watchId", label: "watch" },
  { key: "shirt", label: "shirt" },
  { key: "sweater", label: "sweater" },
  { key: "jacket", label: "jacket" },
  { key: "pants", label: "pants" },
  { key: "shoes", label: "shoes" },
];

export function computeOutfitDiff(prev, next) {
  if (!prev || !next) return { changed: [], kept: [] };
  const changed = [];
  const kept = [];
  for (const { key, label } of COMPARABLE_SLOTS) {
    const a = prev[key] ?? null;
    const b = next[key] ?? null;
    if (a === null && b === null) continue; // empty in both → no signal
    if (a === b) {
      kept.push(label);
    } else {
      changed.push(label);
    }
  }
  return { changed, kept };
}

/**
 * Returns true when the diff has anything meaningful to show.
 * Used to gate the banner render — no point showing "Changed: . Kept: ."
 * if both arrays are empty (e.g., first AI call with no previous pick).
 */
export function hasDiff({ changed, kept }) {
  return (changed?.length ?? 0) > 0 || (kept?.length ?? 0) > 0;
}
