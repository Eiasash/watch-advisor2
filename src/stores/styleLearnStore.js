/**
 * styleLearnStore — tracks wear preferences and biases outfit scoring.
 * Profile shape: { colors: { [color]: 0.1–1.0 }, types: { [type]: 0.1–1.0 } }
 * Weights nudge +0.02 on each wear, decay ×0.98 per session start, clamped [0.1, 1.0].
 * Persisted to localCache under "styleLearning".
 */
import { create } from "zustand";
import { getCachedState, setCachedState } from "../services/localCache.js";

function nudge(map, key, delta) {
  if (!key) return;
  const k = String(key).toLowerCase().trim();
  if (!k) return;
  map[k] = Math.min(1.0, Math.max(0.1, (map[k] ?? 0.5) + delta));
}

function decayAll(map, factor = 0.98) {
  Object.keys(map).forEach(k => { map[k] = Math.max(0.1, map[k] * factor); });
}

export const useStyleLearnStore = create((set, get) => ({
  profile: { colors: {}, types: {} },

  hydrate: (raw = {}) => {
    const profile = { colors: { ...(raw.colors ?? {}) }, types: { ...(raw.types ?? {}) } };
    // Decay once per session start
    decayAll(profile.colors);
    decayAll(profile.types);
    set({ profile });
    // Persist decayed state
    getCachedState().then(cached =>
      setCachedState({ ...cached, styleLearning: profile })
    ).catch(() => {});
  },

  /** Call after each successful outfit log with garments worn */
  recordWear: (garments = []) => {
    set(state => {
      const p = { colors: { ...state.profile.colors }, types: { ...state.profile.types } };
      garments.forEach(g => {
        nudge(p.colors, g.color, +0.02);
        nudge(p.types, g.type || g.garmentType, +0.02);
      });
      getCachedState().then(cached =>
        setCachedState({ ...cached, styleLearning: p })
      ).catch(() => {});
      return { profile: p };
    });
  },

  /** Returns top N colors by preference weight */
  getTopColors: (n = 5) => {
    const { profile } = get();
    return Object.entries(profile.colors ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([color, weight]) => ({ color, weight }));
  },

  /** Returns a 0–1 multiplier for a garment based on preference score */
  preferenceMultiplier: (garment) => {
    const { profile } = get();
    const colorW = profile.colors[(garment.color ?? "").toLowerCase()] ?? 0.5;
    const typeW  = profile.types[(garment.type ?? garment.garmentType ?? "").toLowerCase()] ?? 0.5;
    const raw = typeW * 0.6 + colorW * 0.4;
    return 0.85 + (raw - 0.1) / 0.9 * 0.30;
  },
}));
