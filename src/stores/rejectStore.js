/**
 * rejectStore — tracks rejected outfit suggestions so the engine avoids repeating them.
 * Shape: { watchId, garmentIds[], context, rejectedAt }
 * Persisted to localCache under key "rejectLog".
 * Auto-expires entries older than 30 days on hydration.
 */
import { create } from "zustand";
async function _getCache() { try { const { getCachedState } = await import("../services/localCache.js"); return await getCachedState(); } catch (e) { if (import.meta.env?.DEV) console.warn("[rejectStore] getCache failed:", e.message); return {}; } }
async function _setCache(p) { try { const { setCachedState } = await import("../services/localCache.js"); await setCachedState(p); } catch (e) { if (import.meta.env?.DEV) console.warn("[rejectStore] setCache failed:", e.message); } }

const EXPIRY_DAYS = 30;
const MS = 1000 * 60 * 60 * 24;

function fresh(entries) {
  const cutoff = Date.now() - EXPIRY_DAYS * MS;
  return entries.filter(e => (e.rejectedAt ?? 0) > cutoff);
}

export const useRejectStore = create((set, get) => ({
  entries: [],

  hydrate: (raw = []) => set({ entries: fresh(raw) }),

  addRejection: (watchId, garmentIds = [], context = "", reason = "", slot = "") => {
    const entry = { watchId, garmentIds: garmentIds.slice(), context, reason, slot, rejectedAt: Date.now() };
    set(state => {
      const next = fresh([...state.entries, entry]).slice(-200); // cap at 200
      _getCache().then(cached =>
        _setCache({ ...cached, rejectLog: next }).catch(() => {})
      );
      return { entries: next };
    });
  },

  /** Get rejection reasons for analytics */
  getReasonStats: () => {
    const { entries } = get();
    const reasons = {};
    entries.forEach(e => { if (e.reason) reasons[e.reason] = (reasons[e.reason] ?? 0) + 1; });
    return reasons;
  },

  clearAll: () => {
    set({ entries: [] });
    _getCache().then(cached =>
      _setCache({ ...cached, rejectLog: [] }).catch(() => {})
    );
  },

  /** Check if a (watchId + garmentIds combo) was recently rejected */
  isRejected: (watchId, garmentIds = []) => {
    const { entries } = get();
    return entries.some(e => {
      if (e.watchId !== watchId) return false;
      if (!garmentIds.length) return false;
      const overlap = garmentIds.filter(id => e.garmentIds.includes(id));
      return overlap.length >= Math.min(2, garmentIds.length);
    });
  },

  /** Alias for outfitBuilder compatibility */
  isRecentlyRejected: (watchId, garmentIds = []) => {
    const { entries } = get();
    return entries.some(e => {
      if (e.watchId !== watchId) return false;
      if (!garmentIds.length) return false;
      return garmentIds.some(id => e.garmentIds.includes(id));
    });
  },
}));

export async function hydrateRejectStore() {
  try {
    const { getCachedState } = await import("../services/localCache.js");
    const cached = await getCachedState();
    if (Array.isArray(cached?.rejectLog)) useRejectStore.getState().hydrate(cached.rejectLog);
  } catch (e) { if (import.meta.env?.DEV) console.warn("[rejectStore] hydrate failed:", e.message); }
}
