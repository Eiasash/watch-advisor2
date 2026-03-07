import { useEffect, useState } from "react";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { pullCloudState, subscribeSyncState } from "../services/supabaseSync.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";

export function useBootstrap() {
  const [ready,  setReady]  = useState(false);
  const [status, setStatus] = useState("Loading…");

  const setWatches      = useWatchStore(s => s.setWatches);
  const setGarments     = useWardrobeStore(s => s.setGarments);
  const setHistory      = useHistoryStore(s => s.setEntries);
  const setWeekCtx      = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates  = useWardrobeStore(s => s.setOnCallDates);

  useEffect(() => {
    const off = subscribeSyncState(state => setStatus(`Sync ${state.status}`));

    (async () => {
      // ── 1. Serve from local cache immediately ─────────────────────────────
      const cached = await getCachedState();

      setWatches(cached.watches?.length ? cached.watches : WATCH_COLLECTION);

      // Restore garments — thumbnail is stored inline; full-res objectURLs are gone after refresh
      // (they are ephemeral) — grid only needs thumbnail for display
      const restoredGarments = (cached.garments ?? []).map(g => ({
        ...g,
        // photoUrl may be an expired ObjectURL — clear it so grid falls back to thumbnail
        photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
      }));
      setGarments(restoredGarments);
      setHistory(cached.history ?? []);

      // Restore planner state
      if (Array.isArray(cached.weekCtx) && cached.weekCtx.length === 7) setWeekCtx(cached.weekCtx);
      if (Array.isArray(cached.onCallDates)) setOnCallDates(cached.onCallDates);

      setReady(true);
      setStatus("Ready");

      // ── 2. Pull cloud state in background ────────────────────────────────
      setTimeout(async () => {
        try {
          const cloud = await pullCloudState();
          const w = cloud.watches?.length ? cloud.watches : WATCH_COLLECTION;
          const g = (cloud.garments ?? []).map(g => ({
            ...g,
            photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
          }));
          const h = cloud.history ?? [];

          setWatches(w);
          setGarments(g);
          setHistory(h);
          // Preserve planner state from local (cloud doesn't sync these yet)
          await setCachedState({ watches: w, garments: g, history: h });
        } catch (e) {
          console.warn("[bootstrap] cloud pull failed:", e.message);
        }
      }, 10);
    })();

    return () => off && off();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, status };
}
