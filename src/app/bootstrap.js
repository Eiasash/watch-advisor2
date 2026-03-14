import { useEffect, useState } from "react";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { pullCloudState, subscribeSyncState, pushGarment as pushGarmentSync, uploadPhoto as uploadPhotoSync, uploadAngle as uploadAngleSync, pullSettings, pushSettings } from "../services/supabaseSync.js";
import { registerHandler, resumePendingTasks, flushTasksByType } from "../services/backgroundQueue.js";
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
      registerHandler("upload-photo", async (p) => {
        const publicUrl = await uploadPhotoSync(p.garmentId, p.source, p.kind);
        // Persist the CDN URL back to the garment so it displays from Storage, not base64 thumbnail
        if (publicUrl && p.kind === "thumbnail") {
          const { updateGarment, garments } = useWardrobeStore.getState();
          const { history } = useHistoryStore.getState();
          const { watches } = useWatchStore.getState();
          updateGarment(p.garmentId, { photoUrl: publicUrl });
          const updatedGarments = useWardrobeStore.getState().garments;
          setCachedState({ garments: updatedGarments, watches, history }).catch(() => {});
        }
      });
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
          // Flush any stale push-garment tasks from previous sessions BEFORE pull.
          // These are the root cause of junk re-syncing: old IDB tasks survive
          // across sessions and push deleted garments back to Supabase.
          await flushTasksByType("push-garment");

          const cloud = await pullCloudState();
          if (cloud._localOnly) return; // IS_PLACEHOLDER — never wipe local data

          const w = cloud.watches?.length ? cloud.watches : WATCH_COLLECTION;
          const cloudGarments = (cloud.garments ?? []).map(g => ({
            ...g,
            photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
          }));
          const h = cloud.history ?? [];

          // Cloud is authoritative. Always accept cloud state.
          // The ONLY exception: cloud returns 0 garments AND local has garments
          // that were NEVER synced to cloud (brand new user, first import).
          // We detect this by checking if any local garment has an id starting
          // with "g_" (app-generated) and created_at within the last 5 minutes.
          if (cloudGarments.length === 0) {
            const currentGarments = useWardrobeStore.getState().garments ?? [];
            const fiveMinAgo = Date.now() - 5 * 60 * 1000;
            const freshLocalImports = currentGarments.filter(g => {
              if (!g.id?.startsWith("g_")) return false;
              // Treat garments without createdAt as fresh (just imported, field missing)
              if (!g.createdAt) return true;
              return new Date(g.createdAt).getTime() > fiveMinAgo;
            });
            if (freshLocalImports.length > 0 && currentGarments.length === freshLocalImports.length) {
              // All local items are fresh imports from THIS session — push them to cloud.
              for (const g of freshLocalImports) {
                pushGarmentSync(g).catch(() => {});
              }
              return;
            }
            // Otherwise: cloud was intentionally emptied or user has stale IDB.
            // Accept empty cloud. Clear local.
          }

          setWatches(w);
          setGarments(cloudGarments);
          setHistory(h);
          await setCachedState({ watches: w, garments: cloudGarments, history: h });

          // Pull settings (weekCtx, onCallDates, active straps)
          const settings = await pullSettings();
          if (settings) {
            if (Array.isArray(settings.week_ctx) && settings.week_ctx.length === 7) {
              setWeekCtx(settings.week_ctx);
              await setCachedState({ weekCtx: settings.week_ctx });
            }
            if (Array.isArray(settings.on_call_dates)) {
              setOnCallDates(settings.on_call_dates);
              await setCachedState({ onCallDates: settings.on_call_dates });
            }
            if (settings.active_straps && typeof settings.active_straps === "object") {
              const strapState = useStrapStore.getState();
              // Merge cloud active straps with local (cloud wins)
              const mergedActive = { ...strapState.activeStrap, ...settings.active_straps };
              useStrapStore.setState({ activeStrap: mergedActive });
            }
            if (settings.custom_straps && typeof settings.custom_straps === "object") {
              const strapState = useStrapStore.getState();
              useStrapStore.setState({ straps: { ...strapState.straps, ...settings.custom_straps } });
            }
          }
        } catch (e) {
          console.warn("[bootstrap] cloud pull failed:", e.message);
        }
      }, 10);

      // ── 4. Auto-push settings on change ─────────────────────────────────
      let settingsDebounce = null;
      const pushSettingsDebounced = () => {
        clearTimeout(settingsDebounce);
        settingsDebounce = setTimeout(() => {
          const { weekCtx, onCallDates } = useWardrobeStore.getState();
          const { activeStrap, straps } = useStrapStore.getState();
          // Only sync custom straps (seed straps are immutable)
          const customStraps = {};
          for (const [id, s] of Object.entries(straps)) {
            if (s.custom) customStraps[id] = s;
          }
          pushSettings({ weekCtx, onCallDates, activeStraps: activeStrap, customStraps }).catch(() => {});
        }, 2000);
      };
      const offWardrobe = useWardrobeStore.subscribe(
        (state, prev) => {
          if (state.weekCtx !== prev.weekCtx || state.onCallDates !== prev.onCallDates) {
            pushSettingsDebounced();
          }
        }
      );
      const offStrap = useStrapStore.subscribe(
        (state, prev) => {
          if (state.activeStrap !== prev.activeStrap || state.straps !== prev.straps) {
            pushSettingsDebounced();
          }
        }
      );
    })();

    return () => { off && off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, status };
}
