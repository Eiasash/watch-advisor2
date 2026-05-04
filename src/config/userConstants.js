/**
 * Per-user constants — single source of truth for hardcoded user context.
 *
 * This is a single-user app (one physician, Jerusalem) so timezone +
 * coordinates are baked in. Centralized here so the value isn't scattered
 * across function files where it eventually drifts (it already drifted
 * once: the daily-pick weather TZ bug PR #134 was caused by the same
 * literal "Asia/Jerusalem" being interpreted differently in two places).
 *
 * If this app ever becomes multi-user, every consumer of these constants
 * must be re-routed to a per-user lookup. The grep target is each export
 * name below.
 */

export const USER_TIMEZONE = "Asia/Jerusalem";
export const USER_LATITUDE = 31.7683;
export const USER_LONGITUDE = 35.2137;
