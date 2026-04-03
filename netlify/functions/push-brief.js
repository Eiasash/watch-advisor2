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

async function fetchJerusalemWeather() {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=31.7683&longitude=35.2137&daily=temperature_2m_max,temperature_2m_min,weathercode&hourly=temperature_2m&timezone=Asia/Jerusalem&forecast_days=7"
    );
    const data = await res.json();
    const hourly = data.hourly;
    return (data.daily?.time ?? []).map((date, i) => {
      const dayHours = (hourly?.time ?? []).reduce((acc, t, idx) => {
        if (t.startsWith(date)) acc.push({ hour: parseInt(t.slice(11, 13), 10), temp: hourly.temperature_2m[idx] });
        return acc;
      }, []);
      const avg = (hours) => {
        const v = dayHours.filter(h => hours.includes(h.hour)).map(h => h.temp);
        return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
      };
      return {
        date,
        tempMin: Math.round(data.daily.temperature_2m_min[i]),
        tempMax: Math.round(data.daily.temperature_2m_max[i]),
        tempMorning: avg([7, 8, 9, 10]),
        tempMidday: avg([11, 12, 13, 14]),
        code: data.daily.weathercode[i],
      };
    });
  } catch { return []; }
}

async function buildBrief(apiKey) {
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" });
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Jerusalem" });

  const supabase = sb();
  const [{ data: history }, { data: garments }] = await Promise.all([
    supabase.from("history").select("date,watch_id,payload").order("date", { ascending: false }).limit(7),
    supabase.from("garments").select("id,name,type,color,formality,brand")
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .not("type", "in", "(outfit-photo,outfit-shot,watch)")
      .limit(100),
  ]);

  const forecast = await fetchJerusalemWeather();
  const todayWeather = forecast[0];
  const weatherLine = todayWeather
    ? `Morning ${todayWeather.tempMorning ?? todayWeather.tempMin}°C, midday ${todayWeather.tempMidday ?? todayWeather.tempMax}°C`
    : "weather unknown";

  const recentWatches = (history ?? []).map(e => e.watch_id).filter(Boolean).slice(0, 5);
  const garmentSummary = (garments ?? [])
    .filter(g => !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type))
    .slice(0, 80)
    .map(g => `${g.name ?? (g.color + " " + g.type)}${g.brand ? " (" + g.brand + ")" : ""}`)
    .join(", ");

  const prompt = `You are a concise morning style advisor. Generate a sharp morning brief for a watch collector and physician in Jerusalem.

TODAY: ${dayName}, ${dateStr}
WEATHER: ${weatherLine}
RECENT WATCHES WORN: ${recentWatches.join(", ") || "none"}
WARDROBE: ${garmentSummary || "varied smart casual wardrobe"}

COLLECTION (13 genuine): Grand Seiko Snowflake, Grand Seiko Rikka green, Cartier Pasha 41mm grey (prefer black alligator strap over bracelet), Cartier Santos Large white/gold, Cartier Santos Octagon YG vintage, GP Laureato 42mm blue, JLC Reverso Duoface, Tudor BB41, TAG Monaco, Omega Speedmaster, Rolex GMT-Master II, Hanhart Pioneer Flyback, Laco Flieger. Replicas (10): AP Royal Oak green, VC Overseas burgundy, IWC Perpetual blue, IWC Ingenieur teal, Rolex Day-Date turquoise, Rolex OP grape, Rolex GMT Meteorite, Chopard Alpine Eagle red, Cartier Santos 35mm white, Breguet Tradition black.

RULES: Brown strap = brown shoes. Black strap = black shoes. Bracelet = any shoes. No loafers. Layer tip if morning < midday by 5°+.

Return ONLY valid JSON:
{
  "title": "short punchy title (max 6 words)",
  "watch": "specific watch name",
  "strap": "strap recommendation",
  "outfit": "complete outfit in one sentence",
  "why": "one sentence why this works",
  "layerTip": "layer transition tip or null",
  "icon": "single emoji"
}`;

  const data = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = data?.content?.[0]?.text ?? "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

async function buildWeeklyBrief(apiKey) {
  const supabase = sb();
  const [{ data: history }, { data: garments }] = await Promise.all([
    supabase.from("history").select("date,watch_id,payload").order("date", { ascending: false }).limit(14),
    supabase.from("garments").select("id,name,type,color,brand")
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .not("type", "in", "(outfit-photo,outfit-shot,watch)")
      .limit(100),
  ]);

  const forecast = await fetchJerusalemWeather();
  const weatherSummary = forecast.slice(0, 7).map(f => {
    const day = new Date(f.date).toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Jerusalem" });
    return `${day}: ${f.tempMin}-${f.tempMax}°C (morning ${f.tempMorning ?? "?"}°)`;
  }).join("\n");

  const recentWatches = (history ?? []).map(e => `${e.date}: ${e.watch_id}`).slice(0, 10).join(", ");
  const garmentList = (garments ?? [])
    .filter(g => !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type))
    .slice(0, 60)
    .map(g => `${g.name}`)
    .join(", ");

  const prompt = `You are a weekly wardrobe planner for a physician and watch collector in Jerusalem.

7-DAY FORECAST:
${weatherSummary}

RECENT WATCHES (last 2 weeks): ${recentWatches || "none"}
WARDROBE: ${garmentList}
COLLECTION: 23 watches (13 genuine, 10 replica). Avoid repeating same watch within 3 days.

Generate a 7-day watch rotation with one-line outfit suggestion per day. Be specific about garment names and watch+strap combos.

Return ONLY valid JSON:
{
  "title": "Week of [date range] — [theme]",
  "days": [
    { "day": "Mon", "watch": "watch name", "strap": "strap", "outfit": "one sentence", "tip": "optional layer/weather tip or null" }
  ],
  "icon": "single emoji"
}`;

  const data = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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
    // Check for no-wear gap — if no outfit logged in 7+ days, send reminder instead
    const supabase = sb();
    const { data: latestHistory } = await supabase
      .from('history')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);
    const lastWearDate = latestHistory?.[0]?.date;
    if (lastWearDate) {
      const daysSince = Math.floor((Date.now() - new Date(lastWearDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7) {
        const noWearPayload = JSON.stringify({
          title: "⌚ Rotation engine going blind",
          body: `No outfit logged in ${daysSince} days — open the app to keep rotation accurate`,
          data: { url: "https://watch-advisor2.netlify.app/" },
          icon: "/icon-192.png",
          badge: "/icon-96.png",
        });
        const { data: subs2 } = await supabase.from("push_subscriptions").select("*");
        if (subs2?.length) {
          await Promise.allSettled(subs2.map(sub =>
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              noWearPayload, { TTL: 3600 }
            ).catch(() => {})
          ));
          console.log(`[push-brief] No-wear reminder sent (${daysSince}d gap)`);
        }
        return { statusCode: 200 };
      }
    }

    // Monday = weekly brief, other days = daily brief
    const isMonday = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" }) === "Monday";
    let title, body;

    if (isMonday) {
      const weekly = await buildWeeklyBrief(apiKey);
      title = `${weekly.icon ?? "📅"} ${weekly.title ?? "Weekly Rotation"}`;
      const dayLines = (weekly.days ?? []).slice(0, 3).map(d => `${d.day}: ${d.watch}`).join(" · ");
      body = dayLines || "Open the app for your weekly plan";
      // Cache weekly brief
      try { await sb().from("app_config").upsert({ key: "weekly_brief", value: weekly }, { onConflict: "key" }); } catch {}
    } else {
      const brief = await buildBrief(apiKey);
      title = `${brief.icon ?? "⌚"} ${brief.title ?? "Morning Brief"}`;
      body = `${brief.watch} · ${brief.outfit}`;
      if (brief.layerTip) body += ` · 💡 ${brief.layerTip}`;
    }

    const payload = JSON.stringify({
      title,
      body,
      data: { url: "https://watch-advisor2.netlify.app/" },
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
