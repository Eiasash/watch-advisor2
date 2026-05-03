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
 *   Returns a synthetic 401 Response with a JSON body so existing callers'
 *   `res.ok` checks fire naturally — no need to retrofit "if signed in"
 *   guards at every fetch site. The 401 body matches what the server
 *   would have sent (`{ error: "Unauthorized: ..." }`), so error UIs
 *   render consistently.
 *
 * Drop-in replacement: `await fetch(url, opts)` → `await authedFetch(url, opts)`.
 */

import { supabase } from "./supabaseClient.js";

export async function authedFetch(input, init = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    // Synthesize a 401 so callers can keep using `if (!res.ok) ...` logic.
    // The body shape matches what _auth.js sends so error rendering is uniform.
    return new Response(
      JSON.stringify({ error: "Unauthorized: please sign in with GitHub" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
