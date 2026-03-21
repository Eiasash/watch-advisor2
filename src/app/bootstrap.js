import { useEffect, useState } from "react";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { loadAll as loadHistoryEntries } from "../services/persistence/historyPersistence.js";
import { safeGet } from "../services/dbSafeLoad.js";
import { pullCloudState, subscribeSyncState, pushGarment as pushGarmentSync, uploadPhoto as uploadPhotoSync, uploadAngle as uploadAngleSync, pullSettings, pushSettings, pullThumbnails } from "../services/supabaseSync.js";
import { registerHandler, resumePendingTasks, flushTasksByType } from "../services/backgroundQueue.js";
import { checkAndBackup } from "../services/backupService.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useStrapStore }         from "../stores/strapStore.js";
import { useRejectStore, hydrateRejectStore } from "../stores/rejectStore.js";
import { useStyleLearnStore } from "../stores/styleLearnStore.js";

export function useBootstrap() {
  const [ready,  setReady]  = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [syncError, setSyncError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [storageWarnPct, setStorageWarnPct] = useState(null);

  const setWatches      = useWatchStore(s => s.setWatches);
  const setGarments     = useWardrobeStore(s => s.setGarments);
  const setHistory      = useHistoryStore(s => s.setEntries);
  const setWeekCtx      = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates  = useWardrobeStore(s => s.setOnCallDates);
  const hydrateStraps   = useStrapStore(s => s.hydrate);
  const hydrateStyle    = useStyleLearnStore(s => s.hydrate);

  useEffect(() => {
    const off = subscribeSyncState(state => setStatus(`Sync ${state.status}`));
    // Hoisted so the cleanup return() can reach them despite the async IIFE boundary
    let offWardrobe = null;
    let offStrap = null;
    let settingsDebounce = null;

    (async () => {
      // ── 1. Serve from local cache immediately ─────────────────────────────
      const cached = await getCachedState();

      setWatches(cached.watches?.length ? cached.watches : WATCH_COLLECTION);

      // Restore garments — thumbnail is stored inline; full-res objectURLs are gone after refresh
      const restoredGarments = (cached.garments ?? []).map(g => ({
        ...g,
        photoUrl: g.photoUrl?.startsWith("blob:") ? undefined : g.photoUrl,
      }));
      setGarments(restoredGarments);

      // Load history from indexed store (IDB-first) with fallback to blob
      const historyEntries = await loadHistoryEntries();
      setHistory(historyEntries);

      // Restore planner state
      if (Array.isArray(cached.weekCtx) && cached.weekCtx.length === 7) setWeekCtx(cached.weekCtx);
      if (Array.isArray(cached.onCallDates)) setOnCallDates(cached.onCallDates);
      if (cached._outfitOverrides) useWardrobeStore.setState({ _outfitOverrides: cached._outfitOverrides });
      if (cached.strapStore) hydrateStraps(cached.strapStore);
      await hydrateRejectStore();
      hydrateStyle(cached.styleLearning ?? {});

      // One-time migration: prefProfile (orphaned prefStore key) → styleLearning
      // TodayPanel previously wrote wear signals to prefStore (prefProfile IDB key)
      // instead of styleLearnStore (styleLearning IDB key). Merge on first boot
      // so existing wear preference data isn't discarded.
      if (cached.prefProfile && !cached.styleLearning?.colors) {
        const migrated = {
          colors: { ...(cached.prefProfile.colors ?? {}) },
          types:  { ...(cached.prefProfile.types  ?? {}) },
        };
        hydrateStyle(migrated);
        setCachedState({ styleLearning: migrated, prefProfile: null }).catch(() => {});
      }

      // ── Storage quota check — warn if IDB eviction risk ──────────────
      if (navigator.storage?.estimate) {
        try {
          const { usage, quota } = await navigator.storage.estimate();
          const pct = quota ? (usage / quota) * 100 : 0;
          if (pct > 70) {
            console.warn(`[bootstrap] Storage at ${pct.toFixed(0)}% — garment images at risk of eviction`, { usage, quota });
            setStorageWarnPct(Math.round(pct));
          }
        } catch { /* non-critical */ }
      }

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
          // The ONLY exception: cloud returns 0 garments AND local has garments.
          // In that case, push all local garments to cloud and abort the pull.
          // This prevents transient cloud-empty states (auth glitch, sync gap)
          // from destroying a non-empty local wardrobe.
          if (cloudGarments.length === 0) {
            const currentGarments = useWardrobeStore.getState().garments ?? [];
            if (currentGarments.length > 0) {
              for (const g of currentGarments) {
                pushGarmentSync(g).catch(() => {});
              }
              return;
            }
          }

          setWatches(w);
          setGarments(cloudGarments);
          setHistory(h);
          await setCachedState({ watches: w, garments: cloudGarments, history: h });

          // Phase 2: lazy-load thumbnails now that UI is interactive with metadata
          pullThumbnails().catch(() => {});

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
          setSyncError(e.message || "Cloud sync failed");
        }
      }, 10);

      // ── 4. Auto-push settings on change ─────────────────────────────────
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
      offWardrobe = useWardrobeStore.subscribe(
        (state, prev) => {
          if (state.weekCtx !== prev.weekCtx || state.onCallDates !== prev.onCallDates) {
            pushSettingsDebounced();
          }
        }
      );
      offStrap = useStrapStore.subscribe(
        (state, prev) => {
          if (state.activeStrap !== prev.activeStrap || state.straps !== prev.straps) {
            pushSettingsDebounced();
          }
        }
      );
    })();

    return () => {
      off?.();
      offWardrobe?.();
      offStrap?.();
      if (settingsDebounce) clearTimeout(settingsDebounce);
    };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrySync = () => {
    setSyncError(null);
    setStatus("Retrying…");
    setRetryCount(c => c + 1);
  };

  return { ready, status, syncError, retrySync, storageWarnPct };
}
