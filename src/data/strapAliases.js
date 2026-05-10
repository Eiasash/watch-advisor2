/**
 * Strap ID alias map — normalize legacy strap IDs to current canonical IDs.
 *
 * Used at the cloud-pull / IDB-hydrate boundary so all in-memory state and
 * display lookups see canonical IDs. Cloud history is normalized separately
 * by Supabase migration; this map handles user IDB caches that pre-date
 * the migration.
 *
 * Add an entry whenever a strap ID is renamed. Never remove entries —
 * users with stale IDB caches may still need the alias for years.
 */
export const STRAP_ID_ALIASES = Object.freeze({
  // Rikka SS bracelet — was misleadingly named "titanium" (Snowflake is the
  // titanium GS, not Rikka). Renamed v1.13.40. Two legacy IDs both alias here.
  "rikka-titanium-bracelet": "rikka-bracelet",
  "rikka-bracelet-ss": "rikka-bracelet",
});

/**
 * Resolve a strap ID to its canonical form. Returns input unchanged if no
 * alias is registered, including for null/undefined/empty inputs.
 *
 * @param {string|null|undefined} id
 * @returns {string|null|undefined}
 */
export function canonicalStrapId(id) {
  if (!id || typeof id !== "string") return id;
  return STRAP_ID_ALIASES[id] ?? id;
}

/**
 * Normalize a watch_id → strap_id map (e.g., active_straps from cloud or IDB).
 * Returns a new object with the same keys and canonicalized values.
 *
 * @param {Record<string, string>} activeStraps
 * @returns {Record<string, string>}
 */
export function canonicalizeActiveStraps(activeStraps) {
  if (!activeStraps || typeof activeStraps !== "object") return activeStraps;
  const out = {};
  for (const [watchId, strapId] of Object.entries(activeStraps)) {
    out[watchId] = canonicalStrapId(strapId);
  }
  return out;
}
