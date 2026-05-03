/**
 * Shared auth middleware for browser-callable Netlify functions.
 *
 * Validates a Supabase Auth JWT from the `Authorization: Bearer <token>`
 * header and enforces a single-user email allowlist.
 *
 * Why JWT + allowlist (not just JWT)?
 *   GitHub OAuth via Supabase will let any GitHub user obtain a valid JWT
 *   for this project. Without the allowlist, "valid JWT" doesn't mean
 *   "this is Eias" — it just means "this is some GitHub user." The
 *   ALLOWED_USER_EMAIL env var is what keeps the gate single-user-secure.
 *
 * Why this lives in _auth.js (not inline per function):
 *   ~14 browser-callable functions need the same gate. Inline would be
 *   14 copies of the same logic, drifting independently. One helper +
 *   one-line wrapper per function = stays in sync forever.
 *
 * Usage at the top of any browser-called function:
 *
 *   import { requireUser } from "./_auth.js";
 *   import { cors } from "./_cors.js";
 *
 *   export async function handler(event) {
 *     const CORS = cors(event);
 *     if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
 *     const auth = await requireUser(event);
 *     if (auth.error) return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };
 *     // ... rest of handler, with auth.user available if needed
 *   }
 *
 * Skip for: scheduled functions (push-brief, auto-heal, monthly-report,
 * supabase-keepalive) — those run on cron and have no browser caller, no
 * Authorization header to validate.
 */

import { createClient } from "@supabase/supabase-js";

let _adminClient = null;
function getAdminClient() {
  if (_adminClient) return _adminClient;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials for auth validation");
  _adminClient = createClient(url, key);
  return _adminClient;
}

/**
 * Validate the request's bearer JWT against Supabase Auth and check the
 * resolved user against the email allowlist.
 *
 * Rollout-safe behavior — the gate is OFF by default. To activate:
 *   Set AUTH_GATE_ENABLED=true in Netlify env vars.
 * This lets the PR ship and the GitHubLoginButton become visible BEFORE
 * any function starts requiring a JWT. Sign in once, confirm it works,
 * THEN flip the env var to enable the gate. Fully reversible.
 *
 * @param {object} event — Netlify function event
 * @returns {Promise<{user?, error?, statusCode?}>}
 */
export async function requireUser(event) {
  // Rollout flag: gate is opt-in. Without AUTH_GATE_ENABLED=true the function
  // returns success without checking — same behavior as before this PR.
  if (process.env.AUTH_GATE_ENABLED !== "true") {
    return { user: null, gateDisabled: true };
  }

  const authHeader = event?.headers?.authorization || event?.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: "Unauthorized: missing Bearer token", statusCode: 401 };

  let user;
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { error: "Unauthorized: invalid token", statusCode: 401 };
    user = data.user;
  } catch (err) {
    // Misconfigured server-side creds is a 500, not a 401 — the caller did
    // nothing wrong; the server can't validate.
    return { error: `Auth check failed: ${err.message}`, statusCode: 500 };
  }

  // Allowlist enforcement. Without this, any GitHub user with a valid Supabase
  // JWT would pass the gate — which defeats the point on a single-user app.
  const allowed = process.env.ALLOWED_USER_EMAIL;
  if (!allowed) {
    // Fail closed: if the env var is missing, deny rather than allow-all. A
    // missing allowlist is a deployment misconfiguration we WANT to surface
    // immediately, not silently leave the gate open.
    return { error: "Server misconfigured: ALLOWED_USER_EMAIL not set", statusCode: 500 };
  }
  const userEmail = (user.email ?? "").toLowerCase().trim();
  const allowedEmail = allowed.toLowerCase().trim();
  if (userEmail !== allowedEmail) {
    return { error: "Forbidden: not on allowlist", statusCode: 403 };
  }

  return { user };
}
