/**
 * Person / selfie / mirror-photo filter.
 * Detects outfit photos that should NOT be stored as wardrobe garments.
 */

/**
 * Detect if an image appears to contain a person based on pixel zone analysis.
 * Uses the heuristic: if topF > 0.35 && midF > 0.3 && botF > 0.2 → personLike
 *
 * @param {{ topF: number, midF: number, botF: number, total: number }} zones
 * @returns {boolean}
 */
export function isPersonLike(zones) {
  if (!zones || zones.total < 50) return false;
  return zones.topF > 0.35 && zones.midF > 0.3 && zones.botF > 0.2;
}

/**
 * Check filename for selfie/mirror/outfit keywords.
 */
const SELFIE_KEYWORDS = [
  "selfie", "mirror", "ootd", "fitcheck", "fit-check", "fit check",
  "outfit of the day", "full body", "full-body", "fullbody", "lookbook",
];

export function isSelfieFilename(filename) {
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, " ");
  return SELFIE_KEYWORDS.some(k => lower.includes(k));
}

/**
 * Determine if an image should be classified as an outfit-photo
 * and excluded from garment storage.
 */
export function shouldExcludeAsOutfitPhoto(filename, zones) {
  if (isSelfieFilename(filename)) return true;
  if (isPersonLike(zones)) return true;
  return false;
}
