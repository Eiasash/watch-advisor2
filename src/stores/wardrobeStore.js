import { create } from "zustand";
import { toArray } from "../utils/toArray.js";

/** Sanitise a garment so array fields are always arrays */
function sanitiseGarment(g) {
  if (!g) return g;
  let patched = g;
  if (g.photoAngles !== undefined && !Array.isArray(g.photoAngles)) patched = { ...patched, photoAngles: [] };
  if (g.seasons !== undefined && !Array.isArray(g.seasons))         patched = { ...patched, seasons: [] };
  if (g.contexts !== undefined && !Array.isArray(g.contexts))       patched = { ...patched, contexts: [] };
  return patched;
}

/**
 * v1.13.14 — revoke any blob URLs the garment held (`photoUrl`, `thumbnail`,
 * extra `photoAngles`) so we don't accumulate dangling references after
 * `removeGarment`. classifier/pipeline.js creates blob URLs at import time;
 * without this revoke step, a long session that imports + deletes hundreds
 * of garments leaks blob handles.
 *
 * Idempotent: revokeObjectURL on a non-blob string or already-revoked URL
 * is a no-op. Wrapped in try/catch so a malformed URL doesn't break the
 * remove flow.
 */
function revokeGarmentBlobs(garment) {
  if (!garment) return;
  const candidates = [garment.photoUrl, garment.thumbnail, ...(toArray(garment.photoAngles))];
  for (const url of candidates) {
    if (typeof url !== "string" || !url.startsWith("blob:")) continue;
    try { URL.revokeObjectURL(url); } catch (_) { /* non-fatal */ }
  }
}

export const useWardrobeStore = create((set, get) => ({
  garments: [],
  selectedGarmentId: null,
  highlightedGarmentName: null,

  // Multi-select state
  selectMode: false,
  selectedIds: new Set(),

  // Week planner state (persisted via localCache separately)
  weekCtx: ["smart-casual","smart-casual","smart-casual","smart-casual","smart-casual","casual","casual"],
  onCallDates: [], // ["YYYY-MM-DD", ...]

  // Garment CRUD
  setGarments:   garments => set({ garments: toArray(garments).map(sanitiseGarment) }),
  addGarment:    garment  => set(state => ({ garments: [...state.garments, garment] })),
  updateGarment: (id, updates) => set(state => ({
    garments: state.garments.map(g => g.id === id ? { ...g, ...updates } : g),
  })),
  removeGarment: id => set(state => {
    const removed = state.garments.find(g => g.id === id);
    if (removed) revokeGarmentBlobs(removed);
    return { garments: state.garments.filter(g => g.id !== id) };
  }),
  // Add an angle photo URL to a garment (thumbnail string)
  addAngle: (id, thumbDataUrl) => set(state => ({
    garments: state.garments.map(g => {
      if (g.id !== id) return g;
      const existing = toArray(g.photoAngles);
      if (existing.length >= 4) return g; // max 4 extra angles
      return { ...g, photoAngles: [...existing, thumbDataUrl] };
    }),
  })),

  // Navigation linking
  setSelectedGarmentId:    id   => set({ selectedGarmentId: id }),
  setHighlightedGarmentName: name => set({ highlightedGarmentName: name }),

  // Multi-select
  enterSelectMode: () => set({ selectMode: true }),
  exitSelectMode:  () => set({ selectMode: false, selectedIds: new Set() }),
  toggleSelect: id => set(state => {
    const next = new Set(state.selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selectedIds: next, selectMode: next.size > 0 };
  }),
  clearSelection: () => set({ selectedIds: new Set(), selectMode: false }),

  // Batch actions
  batchDelete: () => set(state => {
    const ids = state.selectedIds;
    return {
      garments: state.garments.filter(g => !ids.has(g.id)),
      selectedIds: new Set(), selectMode: false,
    };
  }),
  batchSetType: type => set(state => ({
    garments: state.garments.map(g =>
      state.selectedIds.has(g.id) ? { ...g, type, needsReview: false } : g
    ),
    selectedIds: new Set(), selectMode: false,
  })),
  // Merge: first selected becomes primary, rest become its angles
  batchMergeAngles: () => set(state => {
    const ids = Array.from(state.selectedIds);
    if (ids.length < 2) return state;
    const [primaryId, ...rest] = ids;
    const primary = state.garments.find(g => g.id === primaryId);
    if (!primary) return state;
    const existAngles = toArray(primary.photoAngles);
    const newAngles = rest.flatMap(rid => {
      const g = state.garments.find(x => x.id === rid);
      const angles = [g?.thumbnail].concat(toArray(g?.photoAngles)).filter(Boolean);
      return angles;
    });
    const merged = [...existAngles, ...newAngles].slice(0, 4);
    return {
      garments: state.garments
        .filter(g => !rest.includes(g.id))
        .map(g => g.id === primaryId ? { ...g, photoAngles: merged } : g),
      selectedIds: new Set(), selectMode: false,
    };
  }),

  // Week planner
  setWeekCtx:    ctx   => set({ weekCtx: ctx }),
  setOnCallDates: dates => set({ onCallDates: dates }),
}));
