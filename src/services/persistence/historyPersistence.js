/**
 * historyPersistence — IDB-first history entry writes.
 *
 * Write order (mandatory):
 *   1. IndexedDB (history_items store)
 *   2. Zustand setState
 *
 * Never update Zustand before IDB — a crash between writes would leave
 * in-memory state ahead of persisted state with no way to reconcile.
 *
 * Migration: on first call to loadAll(), if history_items is empty but the
 * legacy localCache blob has entries, they are migrated into history_items.
 */

import { db } from "../db.js";
import { safeLoad } from "../dbSafeLoad.js";

// useHistoryStore imported lazily inside functions to break the circular dependency:
// historyPersistence → historyStore → historyPersistence
// If imported at module level, esbuild evaluates one before the other and hits a TDZ.
function getHistoryStore() {
  // Dynamic require-style: module is guaranteed to be initialized by the time
  // any persistence function is actually called (after app boot).
  return import("../../stores/historyStore.js").then(m => m.useHistoryStore);
}

const STORE = "history_items";

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Load all history entries from IDB.
 * Migrates from legacy localCache blob if the indexed store is empty.
 */
export async function loadAll() {
  let entries = await safeLoad(STORE);

  // One-time migration: if indexed store is empty, pull from legacy blob
  if (entries.length === 0) {
    try {
      const { getCachedState } = await import("../localCache.js");
      const cached = await getCachedState();
      if (Array.isArray(cached?.history) && cached.history.length > 0) {
        await db.putAll(STORE, cached.history);
        entries = cached.history;
        if (import.meta.env?.DEV) {
          if (import.meta.env.DEV) console.log(`[historyPersistence] migrated ${entries.length} entries from legacy blob`);
        }
      }
    } catch (_) {}
  }

  return entries;
}

// ── Write ────────────────────────────────────────────────────────────────────

/**
 * Add or upsert a history entry.
 * IDB first, then Zustand.
 */
export async function upsert(entry) {
  // 1. IDB
  await db.put(STORE, entry);

  // 2. Zustand (lazy import to break circular dep with historyStore)
  const useHistoryStore = await getHistoryStore();
  useHistoryStore.setState(state => {
    const idx = state.entries.findIndex(e => e.id === entry.id);
    const next = idx >= 0
      ? state.entries.map((e, i) => i === idx ? entry : e)
      : [...state.entries, entry];
    return { entries: next };
  });
}

/**
 * Remove a history entry by id.
 * IDB first, then Zustand.
 */
export async function remove(id) {
  // 1. IDB
  await db.delete(STORE, id);

  // 2. Zustand (lazy import to break circular dep with historyStore)
  const useHistoryStore = await getHistoryStore();
  useHistoryStore.setState(state => ({
    entries: state.entries.filter(e => e.id !== id),
  }));
}

