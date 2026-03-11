/**
 * Netlify function — save or delete a push subscription.
 * POST { subscription, deviceName } → save
 * DELETE { endpoint }               → remove
 */
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
"Content-Type": "application/json",
};

function sb() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  );
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const body = JSON.parse(event.body ?? "{}");

    if (event.httpMethod === "DELETE") {
      const { endpoint } = body;
      if (!endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing endpoint" }) };
      await sb().from("push_subscriptions").delete().eq("endpoint", endpoint);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "POST") {
      const { subscription, deviceName } = body;
      if (!subscription?.endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing subscription" }) };
      await sb().from("push_subscriptions").upsert({
        endpoint:    subscription.endpoint,
        p256dh:      subscription.keys.p256dh,
        auth:        subscription.keys.auth,
        device_name: deviceName ?? "unknown",
      }, { onConflict: "endpoint" });
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
}
