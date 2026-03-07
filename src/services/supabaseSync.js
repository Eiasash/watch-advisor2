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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const IS_PLACEHOLDER = !SUPABASE_URL
  || SUPABASE_URL.includes("example.supabase.co")
  || SUPABASE_URL.includes("your-project");

export async function pullCloudState() {
  if (IS_PLACEHOLDER) {
    setSyncState({ status: "local-only" });
    return { watches: WATCH_COLLECTION, garments: [], history: [], _localOnly: true };
  }

  setSyncState({ status: "pulling" });
  try {
    const [{ data: garments, error: gErr }, { data: history, error: hErr }] = await Promise.all([
      supabase.from("garments").select("*").order("created_at", { ascending: true }),
      supabase.from("history").select("*").order("date", { ascending: false }).limit(60),
    ]);

    if (gErr) throw new Error(gErr.message);
    if (hErr) throw new Error(hErr.message);

    setSyncState({ status: "idle" });
    return {
      watches: WATCH_COLLECTION,
      garments: (garments ?? []).map(row => ({
        ...row,
        // DB column is 'type'; 'category' is an alias kept for compat
        type:        row.type ?? row.category,
        category:    row.type ?? row.category,
        photoUrl:    row.photo_url?.startsWith?.("blob:") ? undefined : (row.photo_url ?? null),
        thumbnail:   row.thumbnail_url ?? null,
        photoType:   row.photo_type ?? null,
        needsReview: row.needs_review ?? false,
        duplicateOf: row.duplicate_of ?? undefined,
        photoAngles: row.photo_angles ?? [],
      })),
      history: (history ?? []).map(row => ({
        id:      row.id,
        watchId: row.watch_id,
        date:    row.date,
        outfit:  row.payload?.outfit ?? {},
      })),
    };
  } catch (e) {
    setSyncState({ status: "error" });
    console.warn("[supabaseSync] pull failed:", e.message);
    return { watches: WATCH_COLLECTION, garments: [], history: [], _localOnly: true };
  }
}

export async function pushGarment(garment) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: syncState.queued + 1 });
  try {
    const { error } = await supabase.from("garments").upsert({
      id:           garment.id,
      name:         garment.name,
      // DB column is 'type' — was incorrectly written as 'category'
      type:         garment.type ?? garment.category,
      category:     garment.type ?? garment.category, // alias column
      color:        garment.color,
      formality:    garment.formality ?? 5,
      hash:         garment.hash ?? "",
      thumbnail_url: garment.thumbnail ?? null,
      photo_url:    typeof garment.photoUrl === "string" && !garment.photoUrl.startsWith("blob:")
                      ? garment.photoUrl : null,
      photo_type:   garment.photoType ?? null,
      needs_review: garment.needsReview ?? false,
      duplicate_of: garment.duplicateOf ?? null,
      photo_angles: garment.photoAngles ?? [],
      brand:        garment.brand ?? null,
      notes:        garment.notes ?? null,
    }, { onConflict: "id" });
    if (error) console.warn("[supabaseSync] pushGarment error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] pushGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}

export async function deleteGarment(id) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: syncState.queued + 1 });
  try {
    const { error } = await supabase.from("garments").delete().eq("id", id);
    if (error) console.warn("[supabaseSync] deleteGarment error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] deleteGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}

export async function pushHistoryEntry(entry) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: syncState.queued + 1 });
  try {
    const { error } = await supabase.from("history").upsert({
      id:       entry.id,
      watch_id: entry.watchId,
      date:     entry.date,
      payload:  { outfit: entry.outfit ?? {} },
    }, { onConflict: "id" });
    if (error) console.warn("[supabaseSync] pushHistoryEntry error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] pushHistoryEntry failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}
