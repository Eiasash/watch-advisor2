/**
 * style-fixed-watch — Stylize an outfit FOR a fixed (pre-chosen) watch.
 *
 * The architectural sibling of daily-pick. Same prompt, same model, same
 * personalization signals — but the watch identity is REQUIRED by the
 * endpoint schema, not optional. This is the critique-driven split (PR #146,
 * code review batch 2): caller intent is encoded in the URL, not in
 * conditional branches inside one function.
 *
 *   POST /.netlify/functions/daily-pick
 *     model picks watch + outfit (used by ClaudePick "Ask Claude" — open)
 *
 *   POST /.netlify/functions/style-fixed-watch    ← THIS FILE
 *     pinnedWatch is REQUIRED; model picks outfit + strap ONLY
 *     (used by WeekPlanner — planner already picked the watch via
 *     deterministic rotation)
 *
 * Why a wrapper instead of duplicating the implementation:
 *   The prompt + cache + Claude call + JSON parse logic in daily-pick.js
 *   is ~250 lines. Duplicating it would create the worst kind of bug
 *   surface — two implementations that drift independently and produce
 *   subtly different picks. Wrapping enforces the schema delta (pinnedWatch
 *   required) at the boundary while reusing the proven implementation.
 *
 * Behavior:
 *   1. CORS + OPTIONS handled identically to daily-pick.
 *   2. Auth gate via requireUser (same as daily-pick).
 *   3. Body parsed; if pinnedWatch missing or malformed → 400 Bad Request.
 *   4. Otherwise delegate to daily-pick's handler — pinnedWatch flows
 *      through and the existing PINNED WATCH prompt block enforces
 *      "use EXACTLY this watch" at the model layer.
 */

import { handler as dailyPickHandler } from "./daily-pick.js";
import { cors } from "./_cors.js";
import { requireUser } from "./_auth.js";

export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  // Auth gate — same as daily-pick. This wrapper isn't a back door around
  // the gate; it adds a schema check on top of identical security.
  const auth = await requireUser(event);
  if (auth.error) {
    return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "invalid JSON body" }) };
  }

  // Schema enforcement — the whole point of this endpoint existing.
  // pinnedWatch must be a non-null object with an id. Reject otherwise so
  // callers can't accidentally use this endpoint for open-watch picks.
  const pw = body.pinnedWatch;
  if (!pw || typeof pw !== "object" || typeof pw.id !== "string" || pw.id.length === 0) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({
        error: "pinnedWatch.id required for style-fixed-watch — use /daily-pick for open-watch picks",
      }),
    };
  }

  // Delegate. The existing daily-pick PINNED WATCH prompt block (PR #141)
  // already constrains the model when pinnedWatch is present. No further
  // shape changes needed here.
  return dailyPickHandler(event);
}
