/**
 * authedFetch — wrapper around fetch() that attaches the Supabase Auth JWT
 * as `Authorization: Bearer <token>` on every browser → Netlify-function call.
 *
 * Why this exists:
 *   ~22 browser fetch() sites call privileged Netlify functions (Claude,
 *   Supabase service-role, GitHub PAT). Server-side gating (_auth.js) needs
 *   each of them to send a valid JWT. Doing this inline at every call site
 *   = 22 copies of the same get-session-and-add-header dance, drifting
 *   independently. This wrapper centralizes it.
 *
 * Behavior on no session:
 *   Calls fetch with NO Authorization header. The server-side _auth.js gate
 *   is the security boundary — it returns 401 to unauthenticated requests,
 *   and the existing `if (!res.ok)` logic in callers handles that uniformly.
 *
 *   Earlier draft synthesized a client-side 401, but that broke vitest tests
 *   that mock `fetch` directly (the synthesized 401 short-circuited before
 *   the mock was reached) without adding any real security — the server
 *   gate is what decides, not the client wrapper.
 *
 * Drop-in replacement: `await fetch(url, opts)` → `await authedFetch(url, opts)`.
 */

import { supabase } from "./supabaseClient.js";

export async function authedFetch(input, init = {}) {
  let token = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? null;
  } catch {
    // Supabase client unavailable (e.g. test env without mock) — proceed
    // unauthenticated; server gate will reject with 401 if needed.
  }

  // Preserve plain-object headers (some callers + tests rely on bracket
  // access like headers["Content-Type"]). Only attach Authorization when a
  // token exists so unauthenticated test paths don't get a stray header.
  const headers = { ...(init.headers ?? {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(input, { ...init, headers });
}
