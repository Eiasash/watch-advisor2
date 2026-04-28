/**
 * useTravelStore — persists user trips locally (IDB via setCachedState).
 * Each trip: { id, destination, startDate, endDate, days, climate, createdAt, notes }.
 * Curated watches/outfits are derived on-demand by travelPlanner — not persisted
 * (they recompute when wardrobe/history changes).
 */

import { create } from "zustand";
import { setCachedState } from "../services/localCache.js";

export const useTravelStore = create((set, get) => ({
  trips: [],

  addTrip: (trip) => {
    const id = trip.id ?? `trip-${Date.now()}`;
    const newTrip = {
      id,
      destination: trip.destination ?? "",
      startDate: trip.startDate ?? null,
      endDate: trip.endDate ?? null,
      days: trip.days ?? 1,
      climate: trip.climate ?? "temperate",
      notes: trip.notes ?? "",
      createdAt: new Date().toISOString(),
      ...trip,
      id, // ensure id is final
    };
    set(s => ({ trips: [newTrip, ...s.trips] }));
    return id;
  },

  updateTrip: (id, patch) => set(s => ({
    trips: s.trips.map(t => t.id === id ? { ...t, ...patch } : t),
  })),

  removeTrip: (id) => set(s => ({ trips: s.trips.filter(t => t.id !== id) })),

  getTrip: (id) => get().trips.find(t => t.id === id) ?? null,

  hydrate: (saved) => {
    if (!saved || !Array.isArray(saved.trips)) return;
    set({ trips: saved.trips });
  },

  serialise: () => ({ trips: get().trips }),
}));

function persist() {
  const state = useTravelStore.getState();
  setCachedState({ travelStore: { trips: state.trips } }).catch(() => {});
}
useTravelStore.subscribe(() => persist());
