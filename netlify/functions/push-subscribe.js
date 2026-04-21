/**
 * Netlify function — save or delete a push subscription.
 * POST { subscription, deviceName } → save
 * DELETE { endpoint }               → remove
 */
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";


function sb() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials not configured");
  return createClient(url, key);
}

export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const body = JSON.parse(event.body ?? "{}");

    if (event.httpMethod === "DELETE") {
      // DELETE requires auth — endpoint strings are opaque but guessable if
      // leaked; unauthenticated delete lets anyone unsubscribe anyone's device.
      // POST (subscribe) stays public so new devices can register themselves.
      const secret = event.headers?.["x-api-secret"];
      if (!process.env.OPEN_API_KEY || !secret || secret !== process.env.OPEN_API_KEY) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "Unauthorized" }) };
      }
      const { endpoint } = body;
      if (!endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing endpoint" }) };
      await sb().from("push_subscriptions").delete().eq("endpoint", endpoint);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "POST") {
      const { subscription, deviceName } = body;
      if (!subscription?.endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing subscription" }) };
      const keys = subscription?.keys ?? {};
      if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid subscription payload" }) };
      }
      const { error } = await sb().from("push_subscriptions").upsert({
        endpoint:    subscription.endpoint,
        p256dh:      keys.p256dh,
        auth:        keys.auth,
        device_name: typeof deviceName === "string" ? deviceName.slice(0, 120) : "unknown",
      }, { onConflict: "endpoint" });
      if (error) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
}
