import { create } from "zustand";

export const useWatchStore = create(set => ({
  watches: [],
  setWatches: watches => set({ watches })
}));
