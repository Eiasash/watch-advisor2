/**
 * tailorConfig — runtime tailor configuration from app_config.
 *
 * Populated by bootstrap.js after pullCloudState(). Components import
 * getTailorPickupDate() to read the pickup date, falling back to null
 * when no config is loaded (which suppresses the countdown display).
 *
 * This module is intentionally NOT a Zustand store — it's a simple singleton
 * so any module can import it without React dependency.
 */

let _config = {};

/** Called once during bootstrap with data from app_config.tailor_config */
export function setTailorConfig(config) {
  _config = (config && typeof config === "object") ? { ...config } : {};
}

/**
 * Get the tailor pickup date.
 * @returns {string|null} ISO date string, or null if not configured
 */
export function getTailorPickupDate() {
  return (typeof _config.pickupDate === "string") ? _config.pickupDate : null;
}

/** Return all current tailor config (for debug display) */
export function getAllTailorConfig() {
  return { ..._config };
}
