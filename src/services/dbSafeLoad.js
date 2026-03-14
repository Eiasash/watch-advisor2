/**
 * dbSafeLoad — safe IDB reads for boot-time data loading.
 *
 * On IDB corruption (schema mismatch, partial upgrade, browser storage errors)
 * the database is deleted and recreated clean so the app can boot without a
 * blank screen. Cloud pull will repopulate state on next sync.
 *
 * All bootstrap loaders MUST use this instead of direct IDB reads.
 */

import { dbPromise, DB_NAME } from "./db.js";

/**
 * Safely read all records from an object store.
 * On any IDB error, deletes the database and returns [].
 * @param {string} store — object store name
 * @returns {Promise<any[]>}
 */
export async function safeLoad(store) {
  try {
    const conn = await dbPromise;
    return await conn.getAll(store);
  } catch (err) {
    console.warn(`[dbSafeLoad] IDB error on store "${store}", resetting DB:`, err.message);
    try {
      await indexedDB.deleteDatabase(DB_NAME);
    } catch (_) {}
    return [];
  }
}

/**
 * Safely get a single keyed value (e.g. the "app" blob in the "state" store).
 * Returns fallback on any error.
 * @param {string} store
 * @param {string} key
 * @param {*} fallback
 */
export async function safeGet(store, key, fallback = null) {
  try {
    const conn = await dbPromise;
    return (await conn.get(store, key)) ?? fallback;
  } catch (err) {
    console.warn(`[dbSafeLoad] IDB error on get "${store}/${key}", returning fallback:`, err.message);
    return fallback;
  }
}
