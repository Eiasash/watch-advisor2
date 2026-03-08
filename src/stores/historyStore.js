import { create } from "zustand";
import { pushHistoryEntry, deleteHistoryEntry } from "../services/supabaseSync.js";
import { setCachedState } from "../services/localCache.js";

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries }),
  addEntry: entry => {
    const all = [...get().entries, entry];
    set({ entries: all });
    setCachedState({ history: all }).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },
  upsertEntry: entry => {
    const existing = get().entries;
    const idx = existing.findIndex(e => e.date === entry.date);
    const all = idx >= 0
      ? existing.map((e, i) => i === idx ? entry : e)
      : [...existing, entry];
    set({ entries: all });
    setCachedState({ history: all }).catch(() => {});
    pushHistoryEntry(entry).catch(() => {});
  },
  removeEntry: id => {
    const all = get().entries.filter(e => e.id !== id);
    set({ entries: all });
    setCachedState({ history: all }).catch(() => {});
    deleteHistoryEntry(id).catch(() => {});
  },
}));
