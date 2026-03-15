import { create } from "zustand";
import { pushHistoryEntry, deleteHistoryEntry } from "../services/supabaseSync.js";

// Lazy import to break the circular dependency:
//   historyStore → historyPersistence → historyStore
// historyPersistence already uses a dynamic import for historyStore.
// A static import here in historyStore would recreate the cycle in Rollup's
// module graph, causing a TDZ error on the minified export (surfaced as
// "Cannot access 'k' before initialization" in production).
let _persistencePromise = null;
function getPersistence() {
  if (!_persistencePromise) {
    _persistencePromise = import("../services/persistence/historyPersistence.js");
  }
  return _persistencePromise;
}

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries }),

  // addEntry / upsertEntry / removeEntry keep the same public API.
  // Write order is now: IDB → Zustand (via persistUpsert) → cloud (fire-and-forget).

  addEntry: entry => {
    // IDB-first + Zustand handled by persistUpsert; cloud is fire-and-forget.
    getPersistence().then(m => m.upsert(entry)).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },

  upsertEntry: entry => {
    getPersistence().then(m => m.upsert(entry)).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },

  removeEntry: id => {
    getPersistence().then(m => m.remove(id)).catch(() => {});
    deleteHistoryEntry(id).catch(() => {});
  },
}));
