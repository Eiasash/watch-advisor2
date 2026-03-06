import { supabase } from "./supabaseClient.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";

let syncState = { status: "idle", queued: 0 };
const listeners = new Set();

function emit() { listeners.forEach(fn => fn({ ...syncState })); }

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn({ ...syncState });
  return () => listeners.delete(fn);
}

function setSyncState(patch) {
  syncState = { ...syncState, ...patch };
  emit();
}

export async function pullCloudState() {
  setSyncState({ status: "pulling" });
  try {
    const [{ data: garments }, { data: history }] = await Promise.all([
      supabase.from("garments").select("*").order("created_at", { ascending: true }),
      supabase.from("history").select("*").order("date", { ascending: false }).limit(30),
    ]);

    setSyncState({ status: "idle" });
    return {
      watches: WATCH_COLLECTION,   // watches are always seeded, never from DB
      garments: garments ?? [],
      history: (history ?? []).map(row => ({
        id: row.id,
        watchId: row.watch_id,
        date: row.date,
        outfit: row.payload?.outfit ?? {},
      })),
    };
  } catch (e) {
    setSyncState({ status: "error" });
    console.warn("[supabaseSync] pull failed:", e.message);
    return { watches: WATCH_COLLECTION, garments: [], history: [] };
  }
}

export async function pushGarment(garment) {
  setSyncState({ queued: syncState.queued + 1 });
  try {
    await supabase.from("garments").upsert({
      id:            garment.id,
      name:          garment.name,
      type:          garment.type,
      color:         garment.color,
      formality:     garment.formality,
      hash:          garment.hash,
      thumbnail_url: garment.thumbnail,
      photo_url:     garment.photoUrl,
    }, { onConflict: "id" });
  } catch (e) {
    console.warn("[supabaseSync] pushGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}

export async function pushHistoryEntry(entry) {
  setSyncState({ queued: syncState.queued + 1 });
  try {
    await supabase.from("history").upsert({
      id:       entry.id,
      watch_id: entry.watchId,
      date:     entry.date,
      payload:  { outfit: entry.outfit ?? {} },
    }, { onConflict: "id" });
  } catch (e) {
    console.warn("[supabaseSync] pushHistoryEntry failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}
