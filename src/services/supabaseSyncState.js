/**
 * Shared sync state — imported by all supabase sub-modules to avoid circular deps.
 * Do NOT import from supabaseSync.js here.
 */

let syncState = { status: "idle", queued: 0 };
const listeners = new Set();

export function emit() { listeners.forEach(fn => fn({ ...syncState })); }

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn({ ...syncState });
  return () => listeners.delete(fn);
}

export function setSyncState(patch) {
  syncState = { ...syncState, ...patch };
  emit();
}

export function getSyncState() { return syncState; }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const IS_PLACEHOLDER = !SUPABASE_URL
  || SUPABASE_URL.includes("example.supabase.co")
  || SUPABASE_URL.includes("your-project");
