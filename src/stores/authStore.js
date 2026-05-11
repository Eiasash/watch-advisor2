import { create } from "zustand";
import { getSession, onAuthStateChange } from "../services/supabaseAuth.js";

/**
 * Shared auth state. Replaces per-component getSession() + onAuthStateChange
 * subscriptions. Initialized once at boot from `initAuthStore()`; downstream
 * components only read.
 *
 *   isAuthed     — true when a valid session exists. Drives UI gating
 *                  (Header empty-state copy, WeekPlanner auto-load).
 *   user         — full Supabase user object or null.
 *   _initialized — true once the initial getSession() resolves. Distinguishes
 *                  "we know there is no user" from "we haven't checked yet"
 *                  so consumers can avoid flashing the wrong empty state.
 */
export const useAuthStore = create(set => ({
  user: null,
  isAuthed: false,
  _initialized: false,
  _setSession: (session) => set({
    user: session?.user ?? null,
    isAuthed: !!session,
    _initialized: true,
  }),
}));

let _initStarted = false;

/**
 * Idempotent. Call once at app boot. Loads the current session, sets state,
 * and subscribes to auth state changes for the lifetime of the page.
 */
export async function initAuthStore() {
  if (_initStarted) return;
  _initStarted = true;
  const { _setSession } = useAuthStore.getState();
  try {
    const session = await getSession();
    _setSession(session);
  } catch (e) {
    if (import.meta.env?.DEV) console.warn("[authStore] initial getSession failed:", e.message);
    _setSession(null);
  }
  onAuthStateChange((session) => {
    _setSession(session);
  });
}
