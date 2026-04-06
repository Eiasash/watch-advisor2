/**
 * Coerce any value to an array.
 * Protects against non-array truthy values (e.g. strings stored in JSONB,
 * stale IDB cache entries). `?? []` only guards null/undefined — this
 * guards ALL non-array types.
 */
export function toArray(v) {
  return Array.isArray(v) ? v : [];
}
