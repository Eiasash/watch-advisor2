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
  // Replace an existing entry by date (for editing today's log), or append if new
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
}));
