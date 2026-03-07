import { create } from "zustand";

export const useWardrobeStore = create(set => ({
  garments: [],
  setGarments: garments => set({ garments }),
  addGarment: garment => set(state => ({ garments: [...state.garments, garment] })),
  updateGarment: (id, updates) => set(state => ({
    garments: state.garments.map(g => g.id === id ? { ...g, ...updates } : g),
  })),
  removeGarment: id => set(state => ({
    garments: state.garments.filter(g => g.id !== id),
  })),
}));
