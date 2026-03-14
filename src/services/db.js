/**
 * db.js — single IDB management file for watch-advisor2.
 *
 * Version history:
 *   v1/v2: state (blob), images, planner  (localCache era)
 *   v3:    + history_items {keyPath:"id", indexes: watchId, date}
 *           + garments_items {keyPath:"id"}
 *
 * All services that need IDB import from here — never open the DB themselves.
 * localCache.js imports dbPromise from here to stay on the same connection.
 */

import { openDB } from "idb";

export const DB_NAME    = "watch-advisor2";
export const DB_VERSION = 3;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, _newVersion, tx) {
    // v1/v2 stores — create if missing (fresh install or upgrade from v1)
    if (!db.objectStoreNames.contains("state"))   db.createObjectStore("state");
    if (!db.objectStoreNames.contains("images"))  db.createObjectStore("images");
    if (!db.objectStoreNames.contains("planner")) db.createObjectStore("planner");

    // v3: proper indexed stores for history and garments
    if (!db.objectStoreNames.contains("history_items")) {
      const hs = db.createObjectStore("history_items", { keyPath: "id" });
      hs.createIndex("watchId", "watchId");
      hs.createIndex("date",    "date");
    }
    if (!db.objectStoreNames.contains("garments_items")) {
      db.createObjectStore("garments_items", { keyPath: "id" });
    }
  },
});

/** Typed store interface — all persistence services use this, not raw idb calls. */
export const db = {
  async put(store, value) {
    return (await dbPromise).put(store, value);
  },

  async get(store, key) {
    return (await dbPromise).get(store, key);
  },

  async getAll(store) {
    return (await dbPromise).getAll(store);
  },

  async getAllFromIndex(store, indexName, query) {
    return (await dbPromise).getAllFromIndex(store, indexName, query);
  },

  async delete(store, id) {
    return (await dbPromise).delete(store, id);
  },

  async clear(store) {
    return (await dbPromise).clear(store);
  },

  /** Bulk-put an array of records — faster than individual puts for migration. */
  async putAll(store, records) {
    const conn = await dbPromise;
    const tx = conn.transaction(store, "readwrite");
    await Promise.all(records.map(r => tx.store.put(r)));
    await tx.done;
  },
};
