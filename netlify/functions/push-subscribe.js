/**
 * Netlify function — save or delete a push subscription.
 * POST { subscription, deviceName } → save   (requires Bearer JWT)
 * DELETE { endpoint }               → remove (requires Bearer JWT)
 */
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";
import { requireUser } from "./_auth.js";


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
      // DELETE requires Bearer JWT — same gate as POST. The x-api-secret scheme
      // was never reachable from the browser (OPEN_API_KEY is server-side only).
      // A user deleting their own subscription sends the same JWT they use for POST.
      const auth = await requireUser(event);
      if (auth.error) return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };
      const { endpoint } = body;
      if (!endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing endpoint" }) };
      await sb().from("push_subscriptions").delete().eq("endpoint", endpoint);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "POST") {
      // POST now requires Supabase JWT — was open until v1.13.16. Open POST
      // = spam vector: anyone could register a push endpoint and start
      // receiving the user's daily outfit briefs. With the auth gate already
      // enforced on every other browser-callable function (_auth.js since
      // v1.13.7), gating this matches the rest of the surface and closes the
      // last unauthenticated write path on the API.
      const auth = await requireUser(event);
      if (auth.error) return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };

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
