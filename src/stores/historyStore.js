import { create } from "zustand";
import { pushHistoryEntry } from "../services/supabaseSync.js";
import { setCachedState } from "../services/localCache.js";

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries }),
  addEntry: entry => {
    const all = [...get().entries, entry];
    set({ entries: all });
    // Persist locally — compute array before set() to avoid Zustand get() race
    setCachedState({ history: all }).catch(() => {});
    // Sync to cloud — fire and forget
    pushHistoryEntry(entry).catch(() => {});
  },
}));
