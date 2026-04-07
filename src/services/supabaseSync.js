/**
 * Supabase sync orchestrator — backward-compatible re-export facade.
 *
 * All 11 importers continue to import from this file unchanged.
 * Concerns split into focused sub-modules:
 *   supabaseSyncState.js  — shared state (subscribeSyncState, setSyncState)
 *   supabaseGarments.js   — pullCloudState, pushGarment, deleteGarment, history
 *   supabaseStorage.js    — uploadPhoto, uploadAngle, deleteStoragePhoto, pullThumbnails
 *   supabaseSearch.js     — fuzzySearchGarments, semanticSearchGarments
 */

export { subscribeSyncState } from "./supabaseSyncState.js";

export {
  pullCloudState,
  pushGarment,
  deleteGarment,
  pushHistoryEntry,
  deleteHistoryEntry,
} from "./supabaseGarments.js";

export {
  uploadPhoto,
  uploadAngle,
  deleteStoragePhoto,
  pullThumbnails,
} from "./supabaseStorage.js";

export {
  fuzzySearchGarments,
  semanticSearchGarments,
} from "./supabaseSearch.js";

// Settings and config — not large enough to warrant their own module
import { supabase } from "./supabaseClient.js";
import { IS_PLACEHOLDER } from "./supabaseSyncState.js";

export async function pullSettings() {
  if (IS_PLACEHOLDER) return null;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error) { console.warn("[supabaseSync] pullSettings error:", error.message); return null; }
    return data;
  } catch (e) {
    console.warn("[supabaseSync] pullSettings failed:", e.message);
    return null;
  }
}

export async function pullScoringOverrides() {
  if (IS_PLACEHOLDER) return null;
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "scoring_overrides")
      .maybeSingle();
    if (error) { console.warn("[supabaseSync] pullScoringOverrides error:", error.message); return null; }
    const val = data?.value;
    return (val && typeof val === "object") ? val : null;
  } catch (e) {
    console.warn("[supabaseSync] pullScoringOverrides failed:", e.message);
    return null;
  }
}

export async function pushSettings(settings) {
  if (IS_PLACEHOLDER) return;
  try {
    const { error } = await supabase.from("app_settings").upsert({
      id:            "default",
      week_ctx:      settings.weekCtx ?? null,
      on_call_dates: settings.onCallDates ?? null,
      active_straps: settings.activeStraps ?? null,
      custom_straps: settings.customStraps ?? null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) console.warn("[supabaseSync] pushSettings error:", error.message);
  } catch (e) {
    console.warn("[supabaseSync] pushSettings failed:", e.message);
  }
}
