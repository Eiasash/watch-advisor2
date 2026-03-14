import { create } from "zustand";
import { pushHistoryEntry, deleteHistoryEntry } from "../services/supabaseSync.js";
import { upsert as persistUpsert, remove as persistRemove } from "../services/persistence/historyPersistence.js";

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries }),

  // addEntry / upsertEntry / removeEntry keep the same public API.
  // Write order is now: IDB → Zustand (via persistUpsert) → cloud (fire-and-forget).

  addEntry: entry => {
    // IDB-first + Zustand handled by persistUpsert; cloud is fire-and-forget.
    persistUpsert(entry).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },

  upsertEntry: entry => {
    persistUpsert(entry).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },

  removeEntry: id => {
    persistRemove(id).catch(() => {});
    deleteHistoryEntry(id).catch(() => {});
  },
}));
