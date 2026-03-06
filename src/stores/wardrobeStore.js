import { create } from "zustand";

export const useWardrobeStore = create(set => ({
  garments: [],
  setGarments: garments => set({ garments }),
  addGarment: garment => set(state => ({ garments: [...state.garments, garment] }))
}));
