import { create } from "zustand";

export const useHistoryStore = create(set => ({
  entries: [],
  setEntries: entries => set({ entries }),
  addEntry: entry => set(state => ({ entries: [...state.entries, entry] }))
}));
