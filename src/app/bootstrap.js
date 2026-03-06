import { useEffect, useState } from "react";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { pullCloudState, subscribeSyncState } from "../services/supabaseSync.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";

export function useBootstrap() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading cache...");
  const setWatches = useWatchStore(s => s.setWatches);
  const setGarments = useWardrobeStore(s => s.setGarments);
  const setHistory = useHistoryStore(s => s.setEntries);

  useEffect(() => {
    let off = subscribeSyncState(state => {
      setStatus(`Sync ${state.status}`);
    });

    (async () => {
      const cached = await getCachedState();
      setWatches(cached.watches?.length ? cached.watches : WATCH_COLLECTION);
      setGarments(cached.garments || []);
      setHistory(cached.history || []);
      setReady(true);
      setStatus("Ready");

      setTimeout(async () => {
        try {
          const cloud = await pullCloudState();
          setWatches(cloud.watches?.length ? cloud.watches : WATCH_COLLECTION);
          setGarments(cloud.garments || []);
          setHistory(cloud.history || []);
          await setCachedState({
            watches: cloud.watches?.length ? cloud.watches : WATCH_COLLECTION,
            garments: cloud.garments || [],
            history: cloud.history || []
          });
        } catch (e) {
          console.error(e);
        }
      }, 10);
    })();

    return () => off && off();
  }, [setWatches, setGarments, setHistory]);

  return { ready, status };
}
