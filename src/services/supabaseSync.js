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
      supabase.from("garments").select("id,name,type,category,color,formality,hash,photo_url,thumbnail_url,photo_type,needs_review,duplicate_of,exclude_from_wardrobe,photo_angles,brand,subtype,notes,material,pattern,seasons,contexts,price,accent_color,created_at").order("created_at", { ascending: true }).limit(500),
      supabase.from("history").select("*").order("date", { ascending: false }).limit(365),
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
        // Prefer thumbnail_url; fall back to photo_url only if thumbnail_url absent
        thumbnail:   (row.thumbnail_url ?? null) || ((row.photo_url && !row.photo_url?.startsWith?.("blob:")) ? row.photo_url : null),
        photoType:   row.photo_type ?? null,
        needsReview: row.needs_review ?? false,
        duplicateOf: row.duplicate_of ?? undefined,
        excludeFromWardrobe: row.exclude_from_wardrobe ?? false,
        photoAngles: row.photo_angles ?? [],
        subtype:     row.subtype ?? null,
        material:    row.material ?? null,
        pattern:     row.pattern ?? null,
        seasons:     row.seasons ?? [],
        contexts:    row.contexts ?? [],
        price:       row.price ?? null,
        accentColor: row.accent_color ?? null,
      })),
      history: (history ?? []).map(row => ({
        id:         row.id,
        watchId:    row.watch_id,
        date:       row.date,
        outfit:     row.payload?.outfit      ?? {},
        garmentIds: row.payload?.garmentIds  ?? [],
        strapId:    row.payload?.strapId     ?? null,
        strapLabel: row.payload?.strapLabel  ?? null,
        context:    row.payload?.context     ?? null,
        notes:      row.payload?.notes       ?? null,
        loggedAt:   row.payload?.loggedAt    ?? null,
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
      photo_angles: (garment.photoAngles ?? []).filter(u => u && typeof u === "string" && !u.startsWith("data:")),
      brand:        garment.brand ?? null,
      subtype:      garment.subtype ?? null,
      notes:        garment.notes ?? null,
      material:     garment.material ?? null,
      pattern:      garment.pattern ?? null,
      seasons:      garment.seasons ?? [],
      contexts:     garment.contexts ?? [],
      price:        garment.price ?? null,
      accent_color: garment.accentColor ?? null,
    }, { onConflict: "id" });
    if (error) {
      console.warn("[supabaseSync] pushGarment error:", error.message);
    } else {
      // Fire-and-forget: generate embedding if OPENAI_API_KEY is configured.
      // No await — never blocks the push path.
      _embedGarment(garment);
    }
  } catch (e) {
    console.warn("[supabaseSync] pushGarment failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
  }
}

/**
 * Upload a photo file (or base64 data URL) to Supabase Storage.
 * Returns the public URL of the uploaded file, or null on failure.
 *
 * @param {string} garmentId
 * @param {File|string} source - File object or base64 data URL
 * @param {"thumbnail"|"original"} kind
 */
export async function uploadPhoto(garmentId, source, kind = "thumbnail") {
  if (IS_PLACEHOLDER) return null;
  try {
    let blob;
    if (typeof source === "string" && source.startsWith("data:")) {
      // Convert base64 data URL → Blob
      const [header, data] = source.split(",");
      const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
      const bytes = atob(data);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      blob = new Blob([arr], { type: mime });
    } else if (source instanceof File || source instanceof Blob) {
      blob = source;
    } else {
      return null;
    }

    const ext = blob.type.includes("png") ? "png" : "jpg";
    const path = `garments/${garmentId}/${kind}.${ext}`;

    const { error } = await supabase.storage
      .from("photos")
      .upload(path, blob, { upsert: true, contentType: blob.type });

    if (error) {
      console.warn("[supabaseSync] uploadPhoto error:", error.message);
      return null;
    }

    const { data } = supabase.storage.from("photos").getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (e) {
    console.warn("[supabaseSync] uploadPhoto failed:", e.message);
    return null;
  }
}

/**
 * Upload an angle photo to Supabase Storage.
 * @param {string} garmentId
 * @param {number} index - angle index (0, 1, 2…)
 * @param {string|File} source - base64 data URL or File
 * @returns {Promise<string|null>} Storage public URL or null
 */
export async function uploadAngle(garmentId, index, source) {
  return uploadPhoto(garmentId, source, `angle-${index}`);
}

export async function deleteStoragePhoto(garmentId) {
  if (IS_PLACEHOLDER) return;
  try {
    const paths = [
      `garments/${garmentId}/thumbnail.jpg`,
      `garments/${garmentId}/thumbnail.png`,
      `garments/${garmentId}/original.jpg`,
      `garments/${garmentId}/original.png`,
    ];
    // Also remove angle photos (up to 4 angles)
    for (let i = 0; i < 4; i++) {
      paths.push(`garments/${garmentId}/angle-${i}.jpg`);
      paths.push(`garments/${garmentId}/angle-${i}.png`);
    }
    await supabase.storage.from("photos").remove(paths);
  } catch (e) {
    console.warn("[supabaseSync] deleteStoragePhoto failed:", e.message);
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

// ---------------------------------------------------------------------------
// pg_trgm fuzzy search — uses GIN index on name/color/type
// Falls back gracefully if DB unavailable. Use when wardrobe > 100 garments
// and you don't want to ship all rows to the client on every keystroke.
// ---------------------------------------------------------------------------
export async function fuzzySearchGarments(query, limit = 12) {
  if (IS_PLACEHOLDER || !query?.trim()) return [];
  try {
    const q = query.trim();
    const { data, error } = await supabase
      .from("garments")
      .select("id,name,type,color,photo_url,thumbnail_url,formality,brand")
      .or(`name.ilike.%${q}%,color.ilike.%${q}%,type.ilike.%${q}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(row => ({
      ...row,
      thumbnail: row.photo_url ?? row.thumbnail_url ?? null,
    }));
  } catch (e) {
    console.warn("[supabaseSync] fuzzySearchGarments failed:", e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vector semantic search — calls match_garments RPC (pgvector cosine distance).
// Requires embeddings to have been generated via generate-embedding function.
// Returns garments ordered by semantic similarity to the query embedding.
// ---------------------------------------------------------------------------
export async function semanticSearchGarments(queryEmbedding, limit = 10) {
  if (IS_PLACEHOLDER || !queryEmbedding?.length) return [];
  try {
    const { data, error } = await supabase.rpc("match_garments", {
      query_embedding: queryEmbedding,
      match_count: limit,
    });
    if (error) throw error;
    return (data ?? []).map(row => ({
      ...row,
      thumbnail: row.photo_url ?? row.thumbnail_url ?? null,
      similarity: row.similarity,
    }));
  } catch (e) {
    console.warn("[supabaseSync] semanticSearchGarments failed:", e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget: generate embedding for a garment and write to DB.
// Silently skips if generate-embedding function returns a non-200.
// ---------------------------------------------------------------------------
async function _embedGarment(garment) {
  try {
    const text = [garment.name, garment.type, garment.color, garment.brand, garment.notes]
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

export async function pushHistoryEntry(entry) {
  if (IS_PLACEHOLDER) return;
  setSyncState({ queued: syncState.queued + 1 });
  try {
    const { error } = await supabase.from("history").upsert({
      id:       entry.id,
      watch_id: entry.watchId,
      date:     entry.date,
      payload:  {
        outfit:       entry.outfit      ?? {},
        garmentIds:   entry.garmentIds  ?? [],
        strapId:      entry.strapId     ?? null,
        strapLabel:   entry.strapLabel  ?? null,
        context:      entry.context     ?? null,
        notes:        entry.notes       ?? null,
        // outfitPhoto excluded from cloud — could be large base64; keep local only
        loggedAt:     entry.loggedAt    ?? null,
      },
    }, { onConflict: "id" });
    if (error) console.warn("[supabaseSync] pushHistoryEntry error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] pushHistoryEntry failed:", e.message);
  } finally {
    setSyncState({ queued: Math.max(0, syncState.queued - 1) });
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
