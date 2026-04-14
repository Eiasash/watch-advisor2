/**
 * Netlify scheduled function — 6:30am daily morning brief.
 * Calls Claude to generate a watch + outfit pick, sends push to all subscribers.
 *
 * Schedule: 30 6 * * *  (06:30 UTC daily)
 * Netlify cron syntax in netlify.toml: schedule = "30 6 * * *"
 */
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { callClaude, extractText } from "./_claudeClient.js";

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

  // Israel work week: Sunday=first work day, Friday=weekend start, Saturday=Shabbat
  const dayNum = parseInt(now.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "Asia/Jerusalem" }), 10);
  const isoDay = now.getDay(); // 0=Sun
  const isWorkDay = isoDay >= 0 && isoDay <= 4; // Sun-Thu
  const isFriday = isoDay === 5;

  const supabase = sb();
  const [{ data: history }, { data: garments }] = await Promise.all([
    supabase.from("history").select("date,watch_id,payload").order("date", { ascending: false }).limit(14),
    supabase.from("garments").select("id,name,type,color,formality,brand,category,notes,seasons,contexts,material,weight")
      .or("exclude_from_wardrobe.is.null,exclude_from_wardrobe.eq.false")
      .not("type", "in", "(outfit-photo,outfit-shot,watch)")
      .limit(100),
  ]);

  const forecast = await fetchJerusalemWeather();
  const todayWeather = forecast[0];
  const weatherLine = todayWeather
    ? `Morning ${todayWeather.tempMorning ?? todayWeather.tempMin}°C, midday ${todayWeather.tempMidday ?? todayWeather.tempMax}°C, code ${todayWeather.code}`
    : "weather unknown";
  const rain = todayWeather?.code >= 51 && todayWeather?.code <= 67;

  // Compute neglected watches (most idle genuine)
  const recentWatchIds = (history ?? []).map(e => e.watch_id).filter(Boolean);
  const watchWearMap = {};
  for (const wid of recentWatchIds) {
    watchWearMap[wid] = (watchWearMap[wid] ?? 0) + 1;
  }
  const allGenuine = ["snowflake","rikka","pasha","laureato","reverso","santos_large","santos_octagon","blackbay","monaco","gmt","speedmaster","hanhart","laco"];
  const neglected = allGenuine
    .filter(w => !recentWatchIds.slice(0, 7).includes(w))
    .slice(0, 3);

  // Recent garments worn (last 5 entries with garmentIds)
  const recentGarmentIds = new Set();
  for (const entry of (history ?? []).slice(0, 5)) {
    const ids = entry.payload?.garmentIds ?? [];
    ids.forEach(id => recentGarmentIds.add(id));
  }

  // Build garment inventory by category with wear status
  const garmentsByCategory = {};
  for (const g of (garments ?? [])) {
    const cat = g.type ?? g.category ?? "other";
    if (["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(cat)) continue;
    if (!garmentsByCategory[cat]) garmentsByCategory[cat] = [];
    const worn = recentGarmentIds.has(g.id);
    const tailorFlagged = /tailor|pulls|billows|wide in torso/i.test(g.notes ?? "");
    garmentsByCategory[cat].push({
      name: g.name ?? `${g.color} ${cat}`,
      brand: g.brand,
      color: g.color,
      formality: g.formality,
      worn,
      tailorFlagged,
    });
  }

  const garmentLines = Object.entries(garmentsByCategory).map(([cat, items]) => {
    const list = items.map(g => {
      let tag = "";
      if (g.worn) tag = " [WORN RECENTLY]";
      if (g.tailorFlagged) tag = " [AT TAILOR]";
      return `${g.name}${g.brand ? " (" + g.brand + ")" : ""}${tag}`;
    }).join(", ");
    return `${cat.toUpperCase()}: ${list}`;
  }).join("\n");

  const contextHint = isWorkDay ? "Work day (clinic possible). Smart casual minimum."
    : isFriday ? "Friday — weekend start. Casual OK."
    : "Weekend. Full casual.";

  const prompt = `You are a concise morning style advisor for a physician and watch collector in Jerusalem.

TODAY: ${dayName}, ${dateStr}
CONTEXT: ${contextHint}
WEATHER: ${weatherLine}${rain ? " — RAIN expected, prefer bracelet watches or NATO straps over leather" : ""}
RECENT WATCHES (last 7 days): ${recentWatchIds.slice(0, 7).join(", ") || "none"}
NEGLECTED GENUINE WATCHES (not worn in 7+ days): ${neglected.join(", ") || "none — good rotation"}

WARDROBE (by category, items marked [WORN RECENTLY] should be avoided, [AT TAILOR] are unavailable):
${garmentLines}

WATCH COLLECTION: Grand Seiko Snowflake (silver, grey/navy/titanium straps), Grand Seiko Rikka (green, teal alligator or titanium bracelet), Cartier Pasha 41mm grey (black alligator preferred — bracelet poor fit), Cartier Santos Large white/gold (bracelet or brown calfskin), Santos Octagon YG vintage, GP Laureato 42mm blue (integrated bracelet), JLC Reverso navy (navy alligator), Tudor BB41 black/red (bracelet, brown distressed, black leather, NATO, Laco brown cross-strap), TAG Monaco (black or brown rally), Omega Speedmaster (10 straps incl bracelet, currently on GS Rikka brown leather), Rolex GMT-Master II (Oyster bracelet), Hanhart Pioneer (6 straps), Laco Flieger (currently no strap — on BB41).

RULES:
- Prioritize NEGLECTED watches over recently worn ones
- Avoid garments marked [WORN RECENTLY] or [AT TAILOR]
- Be specific: name exact garments, exact watch, exact strap
- Strap-shoe color matching is NOT a rule — do not enforce.
- Layer if morning temp < midday by 5°+

Return ONLY valid JSON (no markdown fences):
{
  "title": "short punchy title (max 6 words)",
  "watch": "specific watch name",
  "strap": "specific strap name and color",
  "outfit": {
    "shirt": "exact garment name or null",
    "sweater": "exact garment name or null (if temp < 22°C)",
    "pants": "exact garment name",
    "shoes": "exact shoe name",
    "jacket": "exact jacket name or null (if temp < 16°C)"
  },
  "why": "one sentence why this combo works",
  "layerTip": "morning-to-midday transition tip or null",
  "icon": "single emoji"
}`;

  const data = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = extractText(data);
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

  // haiku sufficient — structured list generation from explicit inputs, no complex reasoning needed
  const data = await callClaude(apiKey, {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = extractText(data);
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

    // Sunday = Israeli work week start (equivalent to Monday in Western calendar)
    const isSunday = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" }) === "Sunday";
    let title, body;

    if (isSunday) {
      const weekly = await buildWeeklyBrief(apiKey);
      title = `${weekly.icon ?? "📅"} ${weekly.title ?? "Weekly Rotation"}`;
      const dayLines = (weekly.days ?? []).slice(0, 3).map(d => `${d.day}: ${d.watch}`).join(" · ");
      body = dayLines || "Open the app for your weekly plan";
      // Cache weekly brief
      try { await sb().from("app_config").upsert({ key: "weekly_brief", value: weekly }, { onConflict: "key" }); } catch {}
    } else {
      const brief = await buildBrief(apiKey);
      title = `${brief.icon ?? "⌚"} ${brief.title ?? "Morning Brief"}`;
      const outfitStr = typeof brief.outfit === "object"
        ? [brief.outfit.sweater, brief.outfit.shirt, brief.outfit.pants, brief.outfit.shoes].filter(Boolean).join(" · ")
        : brief.outfit;
      body = `${brief.watch} (${brief.strap ?? "default"}) · ${outfitStr}`;
      if (brief.layerTip) body += ` · 💡 ${brief.layerTip}`;
      // Cache today's brief for in-app display
      try { await sb().from("app_config").upsert({ key: "daily_brief", value: brief }, { onConflict: "key" }); } catch {}
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
