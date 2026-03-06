import { supabase } from "./supabaseClient.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";

let syncState = { status: "idle", queued: 0 };
const listeners = new Set();

function emit() { listeners.forEach(fn => fn(syncState)); }

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn(syncState);
  return () => listeners.delete(fn);
}

export async function pullCloudState() {
  syncState = { ...syncState, status: "pulling" };
  emit();
  await Promise.resolve(supabase);
  const state = { watches: WATCH_COLLECTION, garments: [], history: [] };
  syncState = { ...syncState, status: "idle" };
  emit();
  return state;
}
