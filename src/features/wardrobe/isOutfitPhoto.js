// Strict selfie/person keywords only — must match word-boundary or start.
// "fit" and "look" removed: too broad, causes false exclusions on garment filenames.
const SELFIE_KWS = ["mirror", "selfie", "ootd", "fitcheck", "fit-check", "fullbody", "lookbook"];

export function isOutfitPhoto(filename) {
  const lower = filename.toLowerCase();
  return SELFIE_KWS.some(k => lower.includes(k));
}
