/**
 * scoringOverrides — runtime scoring weight overrides from auto-heal auto-tune.
 *
 * Populated by bootstrap.js after pullCloudState(). Scoring functions import
 * getOverride() to read auto-tuned values, falling back to their hardcoded defaults.
 *
 * This module is intentionally NOT a Zustand store — it's a simple singleton
 * so pure domain/scoring functions can import it without React dependency.
 */

let _overrides = {};

/** Called once during bootstrap with data from app_config.scoring_overrides */
export function setScoringOverrides(overrides) {
  _overrides = (overrides && typeof overrides === "object") ? { ...overrides } : {};
}

/**
 * Get an auto-tuned weight value, or return the default if no override exists.
 * @param {string} key — e.g. "rotationFactor", "repetitionPenalty", "neverWornRotationPressure"
 * @param {number} defaultVal — the hardcoded default in the source file
 * @returns {number}
 */
export function getOverride(key, defaultVal) {
  if (key in _overrides && typeof _overrides[key] === "number") return _overrides[key];
  return defaultVal;
}

/** Return all current overrides (for debug display) */
export function getAllOverrides() {
  return { ..._overrides };
}
