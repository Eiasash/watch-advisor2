import { create } from "zustand";
import { WATCH_COLLECTION } from "../data/watchSeed.js";

/**
 * Strap store — manages per-watch active strap selection and strap photos.
 * Initialised from watchSeed straps arrays. Photos stored as base64 locally.
 */

function buildInitialStraps() {
  const straps = {};
  for (const watch of WATCH_COLLECTION) {
    if (!watch.straps?.length) continue;
    for (const s of watch.straps) {
      straps[s.id] = {
        ...s,
        watchId: watch.id,
        thumbnail: null,  // base64 — set via addStrapPhoto
        photoUrl: null,   // Supabase Storage URL — set after upload
        wristShot: null,  // base64 wrist shot
      };
    }
  }
  return straps;
}

function buildInitialActive() {
  const active = {};
  for (const watch of WATCH_COLLECTION) {
    if (!watch.straps?.length) continue;
    // Default: first strap (usually bracelet)
    active[watch.id] = watch.straps[0].id;
  }
  return active;
}

export const useStrapStore = create((set, get) => ({
  straps: buildInitialStraps(),       // { [strapId]: StrapObj }
  activeStrap: buildInitialActive(),  // { [watchId]: strapId }

  /** Set the active strap for a watch */
  setActiveStrap: (watchId, strapId) =>
    set(s => ({ activeStrap: { ...s.activeStrap, [watchId]: strapId } })),

  /** Add/update a strap photo thumbnail */
  addStrapPhoto: (strapId, thumbnail, photoUrl = null) =>
    set(s => ({
      straps: {
        ...s.straps,
        [strapId]: { ...s.straps[strapId], thumbnail, photoUrl: photoUrl ?? s.straps[strapId]?.photoUrl },
      },
    })),

  /** Add/update a wrist shot for a strap */
  addWristShot: (strapId, wristShot) =>
    set(s => ({
      straps: {
        ...s.straps,
        [strapId]: { ...s.straps[strapId], wristShot },
      },
    })),

  /** Get active strap object for a watch */
  getActiveStrapObj: (watchId) => {
    const { straps, activeStrap } = get();
    const strapId = activeStrap[watchId];
    return strapId ? straps[strapId] : null;
  },

  /** Get all straps for a watch */
  getStrapsForWatch: (watchId) => {
    const { straps } = get();
    return Object.values(straps).filter(s => s.watchId === watchId);
  },

  /** Restore from serialised state (localCache) */
  hydrate: (saved) => {
    if (!saved) return;
    set(s => ({
      straps: { ...s.straps, ...saved.straps },
      activeStrap: { ...s.activeStrap, ...saved.activeStrap },
    }));
  },

  /** Serialise for localCache */
  serialise: () => {
    const { straps, activeStrap } = get();
    return { straps, activeStrap };
  },
}));


// ── Auto-persist to localCache on every mutation ───────────────────────────
// Done outside the store to avoid circular imports with localCache
import { setCachedState } from "../services/localCache.js";

function persist() {
  const state = useStrapStore.getState();
  // Only persist non-empty photos to avoid blowing up cache with base64
  const strapsToSave = {};
  for (const [id, s] of Object.entries(state.straps)) {
    strapsToSave[id] = {
      id: s.id,
      watchId: s.watchId,
      label: s.label,
      color: s.color,
      type: s.type,
      useCase: s.useCase,
      thumbnail: s.thumbnail ?? null,
      photoUrl: s.photoUrl ?? null,
      wristShot: s.wristShot ?? null,
    };
  }
  setCachedState({ strapStore: { straps: strapsToSave, activeStrap: state.activeStrap } }).catch(() => {});
}

useStrapStore.subscribe(() => persist());
