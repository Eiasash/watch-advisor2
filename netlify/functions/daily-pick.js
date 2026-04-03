import { callClaude, getConfiguredModel } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";

/**
 * daily-pick.js — "Claude's Pick" outfit recommendation.
 * Uses the same styling logic as the human-facing Claude conversation:
 * - Watch rotation pressure (what hasn't been worn)
 * - Hourly weather (morning/midday/evening temps)
 * - Strap-shoe coordination rules
 * - Color harmony with dial
 * - Wardrobe rotation (avoid recent repeats)
 * - Formality layering knowledge
 * - Time-of-day layer transitions
 *
 * GET — returns today's pick (cached for 4 hours in app_config)
 * POST body: { weather, forceRefresh } — regenerate with specific weather
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
  }

  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    const supabase = createClient(url, key);

    // Check cache (regenerate every 4 hours or on force)
    const body = event.httpMethod === "POST" ? JSON.parse(event.body ?? "{}") : {};
    const forceRefresh = body.forceRefresh === true;

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "daily_pick")
        .single();
      if (cached?.value) {
        const pick = cached.value;
        const age = Date.now() - new Date(pick.generatedAt).getTime();
        if (age < 4 * 60 * 60 * 1000) {
          return { statusCode: 200, headers: CORS, body: JSON.stringify(pick) };
        }
      }
    }

    // Fetch garments
    const { data: garments } = await supabase
      .from("garments")
      .select("id,name,type,category,color,brand,formality,material,weight,seasons,contexts")
      .eq("exclude_from_wardrobe", false)
      .not("category", "in", "(outfit-photo,watch,outfit-shot)");

    // Fetch recent history (last 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data: history } = await supabase
      .from("history")
      .select("watch_id,date,payload")
      .gte("date", twoWeeksAgo)
      .order("date", { ascending: false });

    // Weather from body or fetch
    let weather = body.weather ?? null;
    if (!weather) {
      try {
        const wRes = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=31.7683&longitude=35.2137&current_weather=true&hourly=temperature_2m&timezone=Asia/Jerusalem&forecast_days=1"
        );
        const wData = await wRes.json();
        const hourly = wData.hourly;
        const today = new Date().toISOString().slice(0, 10);
        const dayHours = (hourly?.time ?? []).reduce((acc, t, i) => {
          if (t.startsWith(today)) acc.push({ hour: parseInt(t.slice(11, 13), 10), temp: hourly.temperature_2m[i] });
          return acc;
        }, []);
        const avg = (hours) => {
          const v = dayHours.filter(h => hours.includes(h.hour)).map(h => h.temp);
          return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
        };
        weather = {
          tempC: wData.current_weather?.temperature ?? 15,
          tempMorning: avg([7, 8, 9, 10]),
          tempMidday: avg([11, 12, 13, 14]),
          tempEvening: avg([17, 18, 19, 20]),
          description: wData.current_weather?.weathercode <= 3 ? "clear/partly cloudy" : "overcast/rain",
        };
      } catch { weather = { tempC: 15, tempMorning: 10, tempMidday: 17, tempEvening: 12 }; }
    }

    // Build garment summary
    const garmentList = garments.map(g => {
      const t = g.type ?? g.category;
      return `${g.name} (${t}, ${g.color}, ${g.brand ?? "unbranded"}, formality:${g.formality ?? 5})`;
    }).join("\n");

    // Recent watches worn
    const recentWatches = (history ?? []).map(h =>
      `${h.date}: ${h.watch_id} — ${h.payload?.strapLabel ?? "unknown strap"}`
    ).join("\n");

    // Recent garments worn
    const recentGarments = (history ?? []).flatMap(h =>
      (h.payload?.garmentIds ?? []).map(id => {
        const g = garments.find(x => x.id === id);
        return g ? `${h.date}: ${g.name}` : null;
      }).filter(Boolean)
    ).join("\n");

    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });

    const prompt = `You are Eias's personal watch & outfit stylist. Generate today's outfit recommendation.

DATE: ${todayStr}
WEATHER: Current ${weather.tempC}°C. Morning: ${weather.tempMorning ?? "?"}°C, Midday: ${weather.tempMidday ?? "?"}°C, Evening: ${weather.tempEvening ?? "?"}°C. ${weather.description ?? ""}

STYLING RULES (non-negotiable):
- Strap-shoe coordination: brown leather strap → brown shoes, black leather strap → black shoes. Metal/titanium bracelet → any footwear.
- No loafers ever.
- Pasha 41 = dress-sport, excluded from on-call/shift pool.
- Laco = field/casual only.
- Shift watches only: Speedmaster, Tudor BB41, Hanhart.
- Bold colorful dial replicas for casual flex; genuine for clinic/formal credibility.
- Layer logic: <10°C coat, <16°C sweater/quarter-zip, <22°C light layer, ≥22°C no layer.
- If morning is cold but midday warms up, recommend a removable layer with a note to shed it.
- Reverso Duoface: white dial for dark outfits (contrast), navy dial for light outfits (depth).
- Cable knit crewneck (black or ecru Kiral) = one level more formal than quarter-zip.
- Camel coat + ecru cable knit = tonal formal. Camel coat + black cable knit = contrast formal.

WATCH COLLECTION (23 pieces — 13 genuine, 10 replica):
Genuine: GS Snowflake (silver-white, Spring Drive), GS Rikka (green, Hi-Beat), Pasha 41 (grey), GP Laureato (blue, integrated bracelet), JLC Reverso (navy, moon phase), Santos Large (white/gold, QuickSwitch), Santos Octagon (white, vintage YG), Tudor BB41 (black/red), TAG Monaco (black), GMT-Master II (black), Speedmaster 3861 (black), Hanhart Pioneer (white/teal), Laco Flieger (black)
Replica: IWC Perpetual (blue), IWC Ingenieur (teal), VC Overseas (burgundy), Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak (green), GMT Meteorite, Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

RECENT WATCHES WORN (avoid repeats):
${recentWatches || "No recent data"}

RECENT GARMENTS WORN (avoid repeats):
${recentGarments || "No recent data"}

WARDROBE (${garments.length} items):
${garmentList}

Respond ONLY with this JSON structure, no markdown:
{
  "watch": "exact watch name",
  "watchId": "watch_id from: snowflake|rikka|pasha|gp_laureato|reverso|santos_large|santos_octagon|blackbay|monaco|gmt_master|speedmaster|hanhart|laco|iwc_perpetual|iwc_ingenieur|vc_overseas|santos_35_rep|chopard_alpine|ap_royal_oak|gmt_meteorite|daydate_turq|rolex_op_grape|breguet_tradition",
  "strap": "specific strap recommendation",
  "shirt": "exact garment name or null",
  "sweater": "exact garment name or null",
  "layer": "exact garment name or null",
  "pants": "exact garment name",
  "shoes": "exact garment name",
  "jacket": "exact garment name or null",
  "belt": "exact garment name or null",
  "reasoning": "2-3 sentences explaining the outfit logic — color harmony, watch dial pairing, weather transition advice",
  "score": 8.5,
  "layerTip": "e.g. 'Shed the quarter-zip after noon — 17°C midday' or null"
}`;

    const model = await getConfiguredModel();
    const result = await callClaude(apiKey, {
      model,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }, { maxAttempts: 2 });

    // Parse response
    const text = result.content?.[0]?.text ?? "{}";
    let pick;
    try {
      pick = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to parse AI response", raw: text.slice(0, 500) }) };
    }

    pick.generatedAt = new Date().toISOString();
    pick.weather = weather;

    // Cache in app_config
    try {
      await supabase.from("app_config").upsert({ key: "daily_pick", value: pick }, { onConflict: "key" });
    } catch {}

    return { statusCode: 200, headers: CORS, body: JSON.stringify(pick) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
