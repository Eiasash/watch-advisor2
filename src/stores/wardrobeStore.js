import { create } from "zustand";

export const useWardrobeStore = create(set => ({
  garments: [],
  selectedGarmentId: null,

  setGarments:         garments => set({ garments }),
  addGarment:          garment  => set(state => ({ garments: [...state.garments, garment] })),
  updateGarment:       (id, updates) => set(state => ({
    garments: state.garments.map(g => g.id === id ? { ...g, ...updates } : g),
  })),
  removeGarment:       id => set(state => ({ garments: state.garments.filter(g => g.id !== id) })),
  setSelectedGarmentId: id => set({ selectedGarmentId: id }),
  // Garment linking — set by outfit slots/AI tags to scroll+highlight in grid
  highlightedGarmentName: null,
  setHighlightedGarmentName: name => set({ highlightedGarmentName: name }),
}));
