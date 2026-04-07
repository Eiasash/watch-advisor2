/**
 * Photo storage operations — Supabase Storage upload/delete for garment photos.
 */

import { supabase } from "./supabaseClient.js";
import { IS_PLACEHOLDER } from "./supabaseSyncState.js";

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

/**
 * Phase 2 thumbnail loader — called after UI is interactive.
 * Fetches only id + thumbnail_url + photo_url from Supabase, then patches
 * the wardrobeStore garments in place. Reduces initial payload by ~1.5MB.
 */
let _thumbInflight = null;
export async function pullThumbnails() {
  if (IS_PLACEHOLDER) return;
  if (_thumbInflight) return _thumbInflight;
  _thumbInflight = _doPullThumbs().finally(() => { _thumbInflight = null; });
  return _thumbInflight;
}

async function _doPullThumbs() {
  try {
    const { data, error } = await supabase
      .from("garments")
      .select("id,thumbnail_url,photo_url")
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .limit(500);

    if (error || !data) return;

    // Build a lookup map: id → { thumbnail, photoUrl }
    const thumbMap = {};
    for (const row of data) {
      const photoUrl = row.photo_url?.startsWith?.("blob:") ? null : (row.photo_url ?? null);
      const thumbnail = (row.thumbnail_url ?? null) || photoUrl;
      if (thumbnail || photoUrl) {
        thumbMap[row.id] = { thumbnail, photoUrl };
      }
    }

    // Patch wardrobeStore — dynamic import to avoid circular deps
    const { useWardrobeStore } = await import("../stores/wardrobeStore.js");
    const store = useWardrobeStore.getState();
    const patched = store.garments.map(g => {
      const th = thumbMap[g.id];
      if (!th) return g;
      return { ...g, thumbnail: th.thumbnail, photoUrl: th.photoUrl };
    });
    useWardrobeStore.setState({ garments: patched });

    if (import.meta.env.DEV) console.log(`[supabaseSync] thumbnails hydrated: ${Object.keys(thumbMap).length}`);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[supabaseSync] pullThumbnails failed:", e.message);
  }
}
