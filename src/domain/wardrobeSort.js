/**
 * wardrobeSort — pure garment ordering by last-worn date.
 *
 * Two meaningful orderings for the wardrobe grid:
 *   - 'stale'  (default) — least-recently-worn first; never-worn at the TOP
 *                          (loudest "you're ignoring this" signal).
 *   - 'recent'           — most-recently-worn first; never-worn at the BOTTOM.
 *
 * Source of truth is garment.lastWorn (ISO date string, e.g. "2026-05-22") —
 * the same denormalized field WardrobeGrid's per-card badge renders, kept in
 * sync by updateGarment({ lastWorn }) on the outfit-log + selfie-match paths.
 *
 * Domain rule: no React, no Zustand, no side effects — pure data → data.
 */

export const SORT_PREF_KEY = "wa2:wardrobeGridSort";

/**
 * Coerce any stored/raw value to a valid sort mode. Anything that is not
 * the literal 'recent' falls back to 'stale' (the default ordering).
 *
 * @param {*} raw
 * @returns {'stale'|'recent'}
 */
export function coerceSortMode(raw) {
  return raw === "recent" ? "recent" : "stale";
}

/**
 * garment.lastWorn → epoch ms, or null when missing/unparseable.
 * A null result means "never worn" and is placed at an extreme of the order.
 */
function wornMs(g) {
  if (!g || !g.lastWorn) return null;
  const ms = new Date(g.lastWorn).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Deterministic tie-break by garment id — keeps equal-date order stable. */
function tieById(a, b) {
  const ai = String(a?.id ?? "");
  const bi = String(b?.id ?? "");
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

/**
 * Return a NEW array of garments ordered by last-worn date. Input is not
 * mutated. Never-worn garments (no/unparseable lastWorn) sort to the top in
 * 'stale' mode and to the bottom in 'recent' mode. Equal dates tie-break by id.
 *
 * @param {Array} garments
 * @param {'stale'|'recent'} [mode='stale']
 * @returns {Array}
 */
export function sortGarmentsByWear(garments, mode = "stale") {
  if (!Array.isArray(garments)) return [];
  const recent = coerceSortMode(mode) === "recent";
  return garments.slice().sort((a, b) => {
    const am = wornMs(a);
    const bm = wornMs(b);
    if (am === null && bm === null) return tieById(a, b);
    if (am === null) return recent ? 1 : -1;   // never-worn: bottom on recent, top on stale
    if (bm === null) return recent ? -1 : 1;
    const diff = recent ? bm - am : am - bm;   // recent: newest first; stale: oldest first
    return diff !== 0 ? diff : tieById(a, b);
  });
}
