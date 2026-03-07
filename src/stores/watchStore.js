import { create } from "zustand";

export const useWatchStore = create(set => ({
  watches: [],
  activeWatch: null,
  setWatches: watches => set({ watches }),
  setActiveWatch: watch => set({ activeWatch: watch }),
}));
