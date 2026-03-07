import { useEffect, useState } from "react";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { pullCloudState, subscribeSyncState, pushGarment as pushGarmentSync, uploadPhoto as uploadPhotoSync, uploadAngle as uploadAngleSync } from "../services/supabaseSync.js";
import { registerHandler, resumePendingTasks } from "../services/backgroundQueue.js";
import { checkAndBackup } from "../services/backupService.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useStrapStore }         from "../stores/strapStore.js";
import { useRejectStore }        from "../stores/rejectStore.js";
import { useStyleLearnStore } from "../stores/styleLearnStore.js";

export function useBootstrap() {
  const [ready,  setReady]  = useState(false);
  const [status, setStatus] = useState("Loading…");

  const setWatches      = useWatchStore(s => s.setWatches);
  const setGarments     = useWardrobeStore(s => s.setGarments);
  const setHistory      = useHistoryStore(s => s.setEntries);
  const setWeekCtx      = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates  = useWardrobeStore(s => s.setOnCallDates);
  const hydrateStraps   = useStrapStore(s => s.hydrate);
  const hydrateRejects  = useRejectStore(s => s.hydrate);
  const hydrateStyle    = useStyleLearnStore(s => s.hydrate);

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
      if (cached._outfitOverrides) useWardrobeStore.setState({ _outfitOverrides: cached._outfitOverrides });
      if (cached.strapStore) hydrateStraps(cached.strapStore);
      await hydrateRejects();
      hydrateStyle(cached.styleLearning ?? {});

      setReady(true);
      setStatus("Ready");

      // ── 2. Resume background tasks & run weekly backup ──────────────────
      registerHandler("push-garment", async (p) => { await pushGarmentSync(p.garment); });
      registerHandler("upload-photo", async (p) => { await uploadPhotoSync(p.garmentId, p.source, p.kind); });
      registerHandler("upload-angle", async (p) => { await uploadAngleSync(p.garmentId, p.index, p.source); });
      registerHandler("verify-photo", async (p) => {
        const res = await fetch("/.netlify/functions/verify-garment-photo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        if (!res.ok) throw new Error(`verify failed: ${res.status}`);
      });
      resumePendingTasks();
      checkAndBackup();

      // ── 3. Pull cloud state in background ────────────────────────────────
      setTimeout(async () => {
        try {
          const cloud = await pullCloudState();
          if (cloud._localOnly) return; // IS_PLACEHOLDER — never wipe local data

          const w = cloud.watches?.length ? cloud.watches : WATCH_COLLECTION;
          const cloudGarments = (cloud.garments ?? []).map(g => ({
            ...g,
            photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
          }));
          const h = cloud.history ?? [];

          // Safety: never replace a non-empty local wardrobe with an empty cloud result.
          // Read CURRENT state (not stale `cached`) to catch garments imported after boot.
          const currentGarments = useWardrobeStore.getState().garments ?? [];
          const localCount = currentGarments.length;
          if (cloudGarments.length === 0 && localCount > 0) {
            // Cloud is empty but local has items — push local up to cloud instead
            const { pushGarment } = await import("../services/supabaseSync.js");
            for (const g of currentGarments) {
              pushGarment(g).catch(() => {});
            }
            return;
          }

          setWatches(w);
          setGarments(cloudGarments);
          setHistory(h);
          // Preserve planner state from local (cloud doesn't sync these yet)
          await setCachedState({ watches: w, garments: cloudGarments, history: h });
        } catch (e) {
          console.warn("[bootstrap] cloud pull failed:", e.message);
        }
      }, 10);
    })();

    return () => off && off();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, status };
}
