import { dbPromise } from "./db.js";

// DB_NAME and DB_VERSION are managed in db.js — do not open the DB here.

export async function getCachedState() {
  const db = await dbPromise;
  return (await db.get("state", "app")) || { watches: [], garments: [], history: [] };
}

/**
 * Merges partial state into persisted state.
 * Passing { weekCtx, onCallDates } won't clobber garments/watches.
 *
 * Atomic read-modify-write — wraps both ops in a single IDB transaction
 * so concurrent callers (e.g. setOutfitOverrides + travelStore + strapStore
 * all firing useEffect persistence in the same tick) don't lose updates.
 *
 * BEFORE: `read existing → merge → put` were three separate microtasks.
 * Two concurrent calls could both read the same `existing`, both merge
 * their own field, and the second write would silently drop the first
 * caller's update. Reproducible under rapid override toggling.
 *
 * AFTER: a single readwrite tx serializes the read + write at the IDB
 * layer. Concurrent callers queue and one finishes before the next reads.
 * Last-write-wins per-field is preserved (intended); cross-field
 * lost-update is gone.
 */
export async function setCachedState(partial) {
  const db = await dbPromise;
  const tx = db.transaction("state", "readwrite");
  const existing = (await tx.store.get("app")) || {};
  await tx.store.put({ ...existing, ...partial }, "app");
  await tx.done;
}

/** Store a full-resolution blob keyed by garment ID */
export async function saveImage(key, blob) {
  const db = await dbPromise;
  await db.put("images", blob, key);
}

/** Get a full-res blob — returns undefined if not cached */
export async function getImage(key) {
  const db = await dbPromise;
  return db.get("images", key);
}

/** Evict image blobs for garment IDs that no longer exist */
export async function evictOrphanImages(existingIds) {
  const db = await dbPromise;
  const tx  = db.transaction("images", "readwrite");
  const keys = await tx.store.getAllKeys();
  for (const k of keys) {
    if (!existingIds.has(String(k))) await tx.store.delete(k);
  }
  await tx.done;
}

/** Nuke ALL cached state, images, and planner data. Forces fresh pull from Supabase on next boot. */
export async function clearCachedState() {
  const db = await dbPromise;
  const tx = db.transaction(["state", "images", "planner"], "readwrite");
  await tx.objectStore("state").clear();
  await tx.objectStore("images").clear();
  await tx.objectStore("planner").clear();
  await tx.done;
}
