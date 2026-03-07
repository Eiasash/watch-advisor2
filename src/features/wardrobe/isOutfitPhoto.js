const selfieKeywords = [
  "mirror",
  "selfie",
  "fit",
  "outfit",
  "look",
];

export function isOutfitPhoto(filename) {
  const lower = filename.toLowerCase();
  return selfieKeywords.some(k => lower.includes(k));
}
