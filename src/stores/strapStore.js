import { create } from "zustand";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { setCachedState } from "../services/localCache.js";

function buildInitialStraps() {
  const straps = {};
  for (const watch of WATCH_COLLECTION) {
    if (!watch.straps?.length) continue;
    for (const s of watch.straps) {
      straps[s.id] = { ...s, watchId: watch.id, thumbnail: null, photoUrl: null, wristShot: null, custom: false };
    }
  }
  return straps;
}

function buildInitialActive() {
  const active = {};
  for (const watch of WATCH_COLLECTION) {
    if (!watch.straps?.length) continue;
    active[watch.id] = watch.straps[0].id;
  }
  return active;
}

export const useStrapStore = create((set, get) => ({
  straps: buildInitialStraps(),
  activeStrap: buildInitialActive(),

  setActiveStrap: (watchId, strapId) =>
    set(s => ({ activeStrap: { ...s.activeStrap, [watchId]: strapId } })),

  addStrapPhoto: (strapId, thumbnail, photoUrl = null) =>
    set(s => ({
      straps: { ...s.straps, [strapId]: { ...s.straps[strapId], thumbnail, photoUrl: photoUrl ?? s.straps[strapId]?.photoUrl } },
    })),

  addWristShot: (strapId, wristShot) =>
    set(s => ({ straps: { ...s.straps, [strapId]: { ...s.straps[strapId], wristShot } } })),

  /** Add a fully custom strap */
  addStrap: (watchId, strapData) => {
    const id = `custom-${watchId}-${Date.now()}`;
    set(s => ({
      straps: { ...s.straps, [id]: { id, watchId, custom: true, thumbnail: null, photoUrl: null, wristShot: null, ...strapData } },
      activeStrap: { ...s.activeStrap, [watchId]: id },
    }));
    return id;
  },

  /** Edit label/color/type/useCase of any strap */
  updateStrap: (strapId, patch) =>
    set(s => ({ straps: { ...s.straps, [strapId]: { ...s.straps[strapId], ...patch } } })),

  /** Delete a strap (and reset active if it was active) */
  deleteStrap: (strapId) =>
    set(s => {
      const newStraps = { ...s.straps };
      const watchId = newStraps[strapId]?.watchId;
      delete newStraps[strapId];
      const newActive = { ...s.activeStrap };
      if (watchId && newActive[watchId] === strapId) {
        const fallback = Object.values(newStraps).find(x => x.watchId === watchId);
        newActive[watchId] = fallback?.id ?? null;
      }
      return { straps: newStraps, activeStrap: newActive };
    }),

  getActiveStrapObj: (watchId) => {
    const { straps, activeStrap } = get();
    const id = activeStrap[watchId];
    return id ? straps[id] : null;
  },

  getStrapsForWatch: (watchId) => Object.values(get().straps).filter(s => s.watchId === watchId),

  hydrate: (saved) => {
    if (!saved) return;
    set(s => ({
      straps: { ...s.straps, ...saved.straps },
      activeStrap: { ...s.activeStrap, ...saved.activeStrap },
    }));
  },

  serialise: () => {
    const { straps, activeStrap } = get();
    return { straps, activeStrap };
  },
}));

function persist() {
  const state = useStrapStore.getState();
  const strapsToSave = {};
  for (const [id, s] of Object.entries(state.straps)) {
    strapsToSave[id] = { id: s.id, watchId: s.watchId, label: s.label, color: s.color, type: s.type, useCase: s.useCase,
      thumbnail: s.thumbnail ?? null, photoUrl: s.photoUrl ?? null, wristShot: s.wristShot ?? null, custom: s.custom ?? false };
  }
  setCachedState({ strapStore: { straps: strapsToSave, activeStrap: state.activeStrap } }).catch(() => {});
}
useStrapStore.subscribe(() => persist());
