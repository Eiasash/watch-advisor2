/**
 * Netlify scheduled function — 6:30am daily morning brief.
 * Calls Claude to generate a watch + outfit pick, sends push to all subscribers.
 *
 * Schedule: 30 6 * * *  (06:30 UTC daily)
 * Netlify cron syntax in netlify.toml: schedule = "30 6 * * *"
 */
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { callClaude } from "./_claudeClient.js";

webpush.setVapidDetails(
  "mailto:eias@watchadvisor.app",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function sb() {
  return createClient(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  );
}

async function buildBrief(apiKey) {
  // Get today's date and day
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" });
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Jerusalem" });

  // Fetch recent history + garments from Supabase to inform suggestion
  const supabase = sb();
  const [{ data: history }, { data: garments }] = await Promise.all([
    supabase.from("history").select("date,watch_id,payload").order("date", { ascending: false }).limit(7),
    supabase.from("garments").select("id,name,type,color,formality,brand").limit(60),
  ]);

  const recentWatches = (history ?? []).map(e => e.watch_id).filter(Boolean).slice(0, 5);
  const recentContexts = (history ?? []).map(e => e.payload?.context).filter(Boolean).slice(0, 5);
  const garmentSummary = (garments ?? [])
    .filter(g => !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type))
    .slice(0, 30)
    .map(g => `${g.name ?? (g.color + " " + g.type)}${g.brand ? " (" + g.brand + ")" : ""}`)
    .join(", ");

  const prompt = `You are a concise morning style advisor. Generate a sharp, specific morning brief for a watch collector and physician.

TODAY: ${dayName}, ${dateStr}
RECENT WATCH IDs WORN: ${recentWatches.join(", ") || "none"}
RECENT CONTEXTS: ${recentContexts.join(", ") || "smart-casual"}
WARDROBE: ${garmentSummary || "varied smart casual wardrobe"}

COLLECTION: Grand Seiko Snowflake, Grand Seiko Rikka green, Cartier Pasha 41mm grey, Cartier Santos Large white/gold, GP Laureato 42mm blue, JLC Reverso Duoface, Tudor BB41, TAG Monaco, Omega Speedmaster, Rolex GMT-Master II, Hanhart Pioneer Flyback, Laco Flieger. Replicas: AP Royal Oak green, VC Overseas burgundy, IWC Perpetual blue, Rolex Day-Date turquoise, Rolex OP grape.

Generate a brief that feels like a smart friend texting you what to wear. Be direct, specific, no fluff.

Return ONLY valid JSON:
{
  "title": "short punchy title (max 6 words)",
  "watch": "specific watch name to wear today",
  "strap": "strap recommendation (1 phrase)",
  "outfit": "complete outfit in one sentence (colors + pieces)",
  "why": "one sentence on why this combo works today",
  "icon": "single emoji that captures today's vibe"
}`;

  const data = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = data?.content?.[0]?.text ?? "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export async function handler() {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey || !process.env.VAPID_PUBLIC_KEY) {
    console.error("[push-brief] Missing env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  try {
    const brief = await buildBrief(apiKey);
    const title = `${brief.icon ?? "⌚"} ${brief.title ?? "Morning Brief"}`;
    const body  = `${brief.watch} · ${brief.outfit}`;
    const payload = JSON.stringify({
      title,
      body,
      data: { brief, url: "https://watch-advisor2.netlify.app/" },
      icon: "/icon-192.png",
      badge: "/icon-96.png",
    });

    // Fetch all subscriptions
    const { data: subs, error } = await sb().from("push_subscriptions").select("*");
    if (error) throw new Error(error.message);
    if (!subs?.length) { console.log("[push-brief] No subscribers"); return { statusCode: 200 }; }

    const stale = [];
    await Promise.allSettled(
      subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600 }
          );
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) stale.push(sub.endpoint);
          else console.warn("[push-brief] send failed:", e.message);
        }
      })
    );

    // Remove stale subscriptions
    if (stale.length) {
      await sb().from("push_subscriptions").delete().in("endpoint", stale);
      console.log(`[push-brief] Removed ${stale.length} stale subscriptions`);
    }

    console.log(`[push-brief] Sent to ${subs.length - stale.length} devices`);
    return { statusCode: 200 };
  } catch (e) {
    console.error("[push-brief] Error:", e.message);
    return { statusCode: 500, body: e.message };
  }
}
