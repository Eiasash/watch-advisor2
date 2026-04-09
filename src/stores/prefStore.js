import { create } from "zustand";

async function _persist(prefProfile) {
  try {
    const { setCachedState } = await import("../services/localCache.js");
    await setCachedState({ prefProfile });
  } catch (e) { if (import.meta.env?.DEV) console.warn("[prefStore] persist failed:", e.message); }
}

function _update(p, g) {
  if (!p.colors) p.colors = {};
  if (!p.types)  p.types  = {};
  const c = (g.color ?? "").toLowerCase().trim();
  if (c) { if (p.colors[c] === undefined) p.colors[c] = 0.5; p.colors[c] = Math.min(1.0, p.colors[c] + 0.02); }
  const t = (g.type ?? g.garmentType ?? "").toLowerCase().trim();
  if (t) { if (p.types[t] === undefined) p.types[t] = 0.5; p.types[t] = Math.min(1.0, p.types[t] + 0.02); }
  return p;
}

export const usePrefStore = create((set, get) => ({
  profile: { colors: {}, types: {} },
  hydrate: (profile) => set({ profile: profile ?? { colors: {}, types: {} } }),
  recordWear: (garments = []) => {
    set(state => {
      const p = { colors: { ...state.profile.colors }, types: { ...state.profile.types } };
      garments.forEach(g => _update(p, g));
      _persist(p);
      return { profile: p };
    });
  },
  decayOnSession: () => {
    set(state => {
      const p = { colors: { ...state.profile.colors }, types: { ...state.profile.types } };
      if (p.colors) for (const c of Object.keys(p.colors)) p.colors[c] = Math.max(0.1, p.colors[c] * 0.98);
      if (p.types)  for (const t of Object.keys(p.types))  p.types[t]  = Math.max(0.1, p.types[t]  * 0.98);
      _persist(p);
      return { profile: p };
    });
  },
  score: (garment) => {
    const { profile } = get();
    const cs = profile.colors?.[(garment.color ?? "").toLowerCase()] ?? 0.5;
    const ts = profile.types?.[(garment.type ?? garment.garmentType ?? "").toLowerCase()] ?? 0.5;
    return (cs + ts) / 2;
  },
}));

export async function hydratePrefStore() {
  try {
    const { getCachedState } = await import("../services/localCache.js");
    const cached = await getCachedState();
    if (cached.prefProfile && typeof cached.prefProfile === "object")
      usePrefStore.getState().hydrate(cached.prefProfile);
    usePrefStore.getState().decayOnSession();
  } catch (e) { if (import.meta.env?.DEV) console.warn("[prefStore] hydrate failed:", e.message); }
}
