/**
 * rejectStore — tracks rejected outfit suggestions so the engine avoids repeating them.
 * Shape: { watchId, garmentIds[], context, rejectedAt }
 * Persisted to localCache under key "rejectLog".
 * Auto-expires entries older than 30 days on hydration.
 */
import { create } from "zustand";
async function _getCache() { const { getCachedState } = await import("../services/localCache.js"); return _getCache(); }
async function _setCache(p) { const { setCachedState } = await import("../services/localCache.js"); return _setCache(p); }

const EXPIRY_DAYS = 30;
const MS = 1000 * 60 * 60 * 24;

function fresh(entries) {
  const cutoff = Date.now() - EXPIRY_DAYS * MS;
  return entries.filter(e => (e.rejectedAt ?? 0) > cutoff);
}

export const useRejectStore = create((set, get) => ({
  entries: [],

  hydrate: (raw = []) => set({ entries: fresh(raw) }),

  addRejection: (watchId, garmentIds = [], context = "") => {
    const entry = { watchId, garmentIds: garmentIds.slice(), context, rejectedAt: Date.now() };
    set(state => {
      const next = fresh([...state.entries, entry]).slice(-200); // cap at 200
      _getCache().then(cached =>
        _setCache({ ...cached, rejectLog: next }).catch(() => {})
      );
      return { entries: next };
    });
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
}));
