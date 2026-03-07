/**
 * Shared Netlify Blobs cache for AI function results.
 * Keyed by content hash — same photo/text = instant cache hit, zero API call.
 *
 * Store: "ai-cache" (global scope, persists across deploys)
 * Key format:
 *   verify:<garmentHash>   → { ok, correctedType, correctedColor, correctedName, confidence, reason }
 *   embed:<textHash>       → { embedding: number[] }
 */

import { getStore } from "@netlify/blobs";

function getAiCache() {
  // Global store — cache is shared across all deploys, production only.
  // In non-production, fall back to deploy-scoped store to avoid polluting prod cache.
  try {
    const isProd = process.env.CONTEXT === "production";
    if (isProd) {
      return getStore("ai-cache");
    }
    // Dev/branch deploys: still use global but with a prefixed namespace
    return getStore("ai-cache-dev");
  } catch {
    return null;
  }
}

/**
 * Get a cached AI result by key.
 * @param {string} key
 * @returns {Promise<object|null>}
 */
export async function cacheGet(key) {
  try {
    const store = getAiCache();
    if (!store) return null;
    return await store.get(key, { type: "json" });
  } catch {
    return null;
  }
}

/**
 * Store an AI result.
 * @param {string} key
 * @param {object} value
 */
export async function cacheSet(key, value) {
  try {
    const store = getAiCache();
    if (!store) return;
    await store.setJSON(key, value);
  } catch {
    // Never block the main response on a cache write failure
  }
}

/**
 * Simple deterministic hash for short strings (garment text descriptions).
 * Not cryptographic — just needs to be collision-resistant enough for cache keys.
 * @param {string} str
 * @returns {string}
 */
export function hashText(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
