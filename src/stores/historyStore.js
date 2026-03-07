import { create } from "zustand";
import { pushHistoryEntry } from "../services/supabaseSync.js";
import { setCachedState } from "../services/localCache.js";

export const useHistoryStore = create((set, get) => ({
  entries: [],
  setEntries: entries => set({ entries }),
  addEntry: entry => {
    set(state => ({ entries: [...state.entries, entry] }));
    // Persist locally
    const all = get().entries;
    setCachedState({ history: all }).catch(() => {});
    // Sync to cloud — fire and forget
    pushHistoryEntry(entry).catch(() => {});
  },
}));
