/**
 * Perceptual hash duplicate detection.
 * Compares dHash values using Hamming distance.
 */

export function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 999;
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) d++;
  }
  return d;
}

/**
 * Find a possible duplicate garment by comparing perceptual hashes.
 * @param {string} newHash - Hash of the new image
 * @param {Array} existingGarments - Array of garment objects with hash field
 * @param {number} threshold - Maximum Hamming distance to consider a duplicate (default: 5)
 * @returns {string|null} - ID of the duplicate garment, or null
 */
export function findDuplicate(newHash, existingGarments, threshold = 5) {
  if (!newHash || newHash.length < 8) return null;
  for (const g of existingGarments) {
    if (g.hash && hammingDistance(newHash, g.hash) <= threshold) {
      return g.id;
    }
  }
  return null;
}
