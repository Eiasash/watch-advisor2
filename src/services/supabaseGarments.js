/**
 * Garment and history data access — Supabase queries for garments + wear history.
 */

import { supabase } from "./supabaseClient.js";
import { WATCH_COLLECTION } from "../data/watchSeed.js";
import { toArray } from "../utils/toArray.js";
import { IS_PLACEHOLDER, setSyncState, getSyncState } from "./supabaseSyncState.js";

let _pullInflight = null;

export async function pullCloudState() {
  if (IS_PLACEHOLDER) {
    setSyncState({ status: "local-only" });
    return { watches: WATCH_COLLECTION, garments: [], history: [], _localOnly: true };
  }

  // Deduplicate concurrent calls — return same promise if already in flight
  if (_pullInflight) return _pullInflight;

  setSyncState({ status: "pulling" });
  _pullInflight = _doPull().finally(() => { _pullInflight = null; });
  return _pullInflight;
}

async function _doPull() {
  try {
    const [{ data: garments, error: gErr }, { data: history, error: hErr }] = await Promise.all([
      // Phase 1: metadata only — no photo_url/thumbnail_url to keep payload <200KB
      supabase.from("garments").select("id,name,type,category,color,formality,hash,photo_type,needs_review,duplicate_of,exclude_from_wardrobe,photo_angles,brand,subtype,notes,material,pattern,seasons,contexts,price,accent_color,weight,fit,created_at").order("created_at", { ascending: true }).limit(500),
      supabase.from("history").select("*").order("date", { ascending: false }).limit(9999),
    ]);

    if (gErr) throw new Error(gErr.message);
    if (hErr) throw new Error(hErr.message);

    setSyncState({ status: "idle" });
    return {
      watches: WATCH_COLLECTION,
      garments: toArray(garments).map(row => ({
        ...row,
        // DB has both 'type' and 'category' columns; JS objects use only 'type'
        type:        row.type ?? row.category,
        category:    undefined, // not set on JS objects — suppresses the ...row spread
        // Phase 1: no photo_url/thumbnail_url in initial query — set null, filled by pullThumbnails
        photoUrl:    null,
        thumbnail:   null,
        photoType:   row.photo_type ?? null,
        needsReview: row.needs_review ?? false,
        duplicateOf: row.duplicate_of ?? undefined,
        excludeFromWardrobe: row.exclude_from_wardrobe ?? false,
        photoAngles: toArray(row.photo_angles),
        subtype:     row.subtype ?? null,
        material:    row.material ?? null,
        pattern:     row.pattern ?? null,
        seasons:     toArray(row.seasons),
        contexts:    toArray(row.contexts),
        price:       row.price ?? null,
        accentColor: row.accent_color ?? null,
        weight:      row.weight ?? null,
        fit:         row.fit ?? null,
      })),
      history: toArray(history).map(row => ({
        id:         row.id,
        watchId:    row.watch_id,
        date:       row.date,
        timeSlot:   row.time_slot ?? row.payload?.timeSlot ?? null,
        outfit:     row.payload?.outfit      ?? {},
        garmentIds: toArray(row.payload?.garmentIds),
        strapId:    row.payload?.strapId     ?? null,
        strapLabel: row.payload?.strapLabel  ?? null,
        context:    row.payload?.context     ?? null,
        notes:      row.payload?.notes       ?? null,
        loggedAt:   row.payload?.loggedAt    ?? null,
        score:      row.payload?.score       ?? null,
        quickLog:   row.payload?.quickLog    ?? false,
        legacy:     row.payload?.legacy      ?? false,
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
  setSyncState({ queued: getSyncState().queued + 1 });
  try {
    const { error } = await supabase.from("garments").upsert({
      id:           garment.id,
      name:         garment.name,
      // DB column is 'type' — was incorrectly written as 'category'
      type:         garment.type,
      category:     garment.type, // alias column
      color:        garment.color,
      formality:    garment.formality ?? 5,
      hash:         garment.hash ?? "",
      // Only store base64 in thumbnail_url if no Storage URL yet (temporary fallback)
      thumbnail_url: (garment.photoUrl && typeof garment.photoUrl === "string" && !garment.photoUrl.startsWith("blob:"))
                      ? null : (garment.thumbnail ?? null),
      photo_url:    typeof garment.photoUrl === "string" && !garment.photoUrl.startsWith("blob:")
                      ? garment.photoUrl : null,
      photo_type:   garment.photoType ?? null,
      needs_review: garment.needsReview ?? false,
      duplicate_of: garment.duplicateOf ?? null,
      exclude_from_wardrobe: garment.excludeFromWardrobe ?? false,
      // Never write base64 data URLs to photo_angles — only Storage URLs
      photo_angles: toArray(garment.photoAngles).filter(u => u && typeof u === "string" && !u.startsWith("data:")),
      brand:        garment.brand ?? null,
      subtype:      garment.subtype ?? null,
      notes:        garment.notes ?? null,
      material:     garment.material ?? null,
      pattern:      garment.pattern ?? null,
      seasons:      toArray(garment.seasons),
      contexts:     toArray(garment.contexts),
      price:        garment.price ?? null,
      accent_color: garment.accentColor ?? null,
      weight:       garment.weight ?? null,
      fit:          garment.fit ?? null,
    }, { onConflict: "id" });
    if (error) {
      console.warn("[supabaseSync] pushGarment error:", error.message);
    } else {
      // Fire-and-forget: generate embedding if garment doesn't already have one.
      if (!garment.embedding) _embedGarment(garment);
    }
  } catch (e) {
    console.warn("[supabaseSync] pushGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, getSyncState().queued - 1) });
  }
}

export async function deleteGarment(id) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: getSyncState().queued + 1 });
  try {
    const { error } = await supabase.from("garments").delete().eq("id", id);
    if (error) console.warn("[supabaseSync] deleteGarment error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] deleteGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, getSyncState().queued - 1) });
  }
}

export async function pushHistoryEntry(entry) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: getSyncState().queued + 1 });
  try {
    const { error } = await supabase.from("history").upsert({
      id:        entry.id,
      watch_id:  entry.watchId,
      date:      entry.date,
      time_slot: entry.timeSlot ?? null,
      payload:  {
        outfit:           entry.outfit        ?? {},
        garmentIds:       entry.garmentIds    ?? [],
        strapId:          entry.strapId       ?? null,
        strapLabel:       entry.strapLabel    ?? null,
        context:          entry.context       ?? null,
        timeSlot:         entry.timeSlot      ?? null,
        notes:            entry.notes         ?? null,
        // outfitPhoto excluded from cloud — could be large base64; keep local only
        loggedAt:         entry.loggedAt      ?? null,
        score:            typeof entry.score === 'number' ? entry.score : null,
        quickLog:         entry.quickLog      ?? false,
        legacy:           entry.legacy        ?? false,
        payload_version:  "v1",
      },
    }, { onConflict: "id" });
    if (error) console.warn("[supabaseSync] pushHistoryEntry error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] pushHistoryEntry failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, getSyncState().queued - 1) });
  }
}

export async function deleteHistoryEntry(id) {
  if (IS_PLACEHOLDER) return;
  try {
    const { error } = await supabase.from("history").delete().eq("id", id);
    if (error) console.warn("[supabaseSync] deleteHistoryEntry error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] deleteHistoryEntry failed:", e.message);
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget: generate embedding for a garment and write to DB.
// ---------------------------------------------------------------------------
async function _embedGarment(garment) {
  try {
    // Secondary guard: check DB record — garment object may be stale
    const { data: existing } = await supabase
      .from("garments").select("embedding").eq("id", garment.id).single();
    if (existing?.embedding) return; // already has embedding — skip

    const text = [garment.name, garment.subtype, garment.type, garment.color, garment.brand, garment.notes]
      .filter(Boolean).join(" ");
    const res = await fetch("/.netlify/functions/generate-embedding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ garmentId: garment.id, text }),
    });
    if (!res.ok) return;
    const { embedding } = await res.json();
    if (!embedding?.length) return;
    await supabase.from("garments").update({ embedding }).eq("id", garment.id);
  } catch {
    // silent — embedding is best-effort, never blocks the main push
  }
}
