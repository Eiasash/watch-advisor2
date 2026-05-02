import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";

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
 * POST body (all optional except where noted):
 *   weather        — { tempC, tempMorning, ... } overrides auto-fetched weather
 *   forceRefresh   — boolean. Bypass cache (always true for steer/regen/variants)
 *   steer          — "more_casual" | "more_formal" | "different_watch" — flexibility nudge
 *   excludeRecent  — array of pick objects (or names) to avoid repeating
 *   rejected       — { outfit, reason } — fire-and-forget feedback. Logged to
 *                    app_config.value.history (and skipped from cache).
 *   variants       — integer 1..3. When >1, returns { variants: [pick, pick, ...] }
 *                    instead of a single pick. Used for "show 2 more options".
 *   why            — boolean. If the previous pick already has a reasoning string
 *                    we surface it client-side; this flag asks the model for a
 *                    deeper rationale on a specific outfit.
 *   currentPick    — pick object passed alongside `why` so the model knows which
 *                    outfit to explain.
 */

const STEER_INSTRUCTIONS = {
  more_casual: "Make this MORE CASUAL than your usual default — relax formality, prefer t-shirts/sneakers/casual watches.",
  more_formal: "Make this MORE FORMAL than your usual default — push toward dress shirts/leather shoes/dressier watches.",
  different_watch: "Suggest a DIFFERENT WATCH FACE for this outfit — the user already saw your prior pick and wants an alternative timepiece.",
};

/**
 * STABLE persona + non-negotiable rules + watch collection + output schema.
 * Goes into the `system` field — Anthropic's prompt-cache will key on this,
 * giving us cache reads on repeat calls within the 5-minute TTL.
 */
function buildSystemPrompt() {
  return `You are Eias's personal watch & outfit stylist. Generate outfit recommendations based on the data provided in the user message.

STYLING RULES (non-negotiable):
- Strap-shoe color matching is NOT a rule — do not enforce strap-shoe coordination.
- No loafers ever.
- Pasha 41 = dress-sport, excluded from on-call/shift pool.
- Laco = field/casual only.
- Shift watches only: Speedmaster, Tudor BB41, Hanhart.
- Bold colorful dial replicas for casual flex; genuine for clinic/formal credibility.
- Layer logic (Mediterranean climate, morning-temp basis): <10°C coat strongly recommended, <14°C sweater/quarter-zip, <22°C light jacket, ≥22°C no jacket. **NO sweater at ≥14°C even if "feels chilly" — Eias is on the Mediterranean coast and explicitly does not want sweaters in that range.**
- If morning is cold but midday warms up, recommend a removable layer with a note to shed it.
- Reverso Duoface: white dial for dark outfits (contrast), navy dial for light outfits (depth).
- Cable knit crewneck (black or ecru Kiral) = one level more formal than quarter-zip.
- Camel coat + ecru cable knit = tonal formal. Camel coat + black cable knit = contrast formal.

WATCH COLLECTION (23 pieces — 13 genuine, 10 replica):
Genuine: GS Snowflake (silver-white, Spring Drive), GS Rikka (green, Hi-Beat), Pasha 41 (grey), GP Laureato (blue, integrated bracelet), JLC Reverso (navy, moon phase), Santos Large (white/gold, QuickSwitch), Santos Octagon (white, vintage YG), Tudor BB41 (black/red), TAG Monaco (black), GMT-Master II (black), Speedmaster 3861 (black), Hanhart Pioneer (white/teal), Laco Flieger (black)
Replica: IWC Perpetual (blue), IWC Ingenieur (teal), VC Overseas (burgundy), Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak (green), GMT Meteorite, Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

OUTPUT SCHEMA — return ONLY valid JSON matching this shape:
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
}

Pay close attention to the PAST CORRECTIONS section in the user message if present — those are direct signals about Eias's actual preferences that should override your defaults.`;
}

/**
 * VOLATILE per-call data: today's date, weather, recent history, wardrobe,
 * steer/exclude/rejected/pastCorrections feedback. Goes in the user message.
 */
function buildUserPrompt({ todayStr, weather, garmentList, garments, recentWatches, recentGarments, steer, excludeRecent, rejected, pastCorrections, variants }) {
  const variantClause = variants > 1
    ? `Return a JSON ARRAY of ${variants} DISTINCT outfit objects (each must use a different watch). Do NOT wrap in markdown.`
    : "Respond ONLY with a single JSON object, no markdown.";

  const steerLine = steer && STEER_INSTRUCTIONS[steer]
    ? `\nFLEXIBILITY DIRECTIVE: ${STEER_INSTRUCTIONS[steer]}\n`
    : "";

  let excludeBlock = "";
  if (Array.isArray(excludeRecent) && excludeRecent.length) {
    const lines = excludeRecent.slice(0, 6).map((p, i) => {
      if (typeof p === "string") return `  ${i + 1}. ${p}`;
      const w = p.watch ?? p.watchId ?? "?";
      const top = p.shirt ?? p.sweater ?? "?";
      return `  ${i + 1}. ${w} + ${top} + ${p.pants ?? "?"} + ${p.shoes ?? "?"}`;
    }).join("\n");
    excludeBlock = `\nDO NOT REPEAT these recent suggestions — pick something genuinely different:\n${lines}\n`;
  }

  let rejectedBlock = "";
  if (rejected && (rejected.outfit || rejected.reason)) {
    const o = rejected.outfit ?? {};
    const w = o.watch ?? o.watchId ?? "(unknown watch)";
    rejectedBlock = `\nUSER REJECTED a prior suggestion (${w} + ${o.shirt ?? o.sweater ?? "?"} + ${o.pants ?? "?"} + ${o.shoes ?? "?"}). Reason: "${rejected.reason ?? "no reason given"}". Avoid the same direction.\n`;
  }

  let correctionsBlock = "";
  if (Array.isArray(pastCorrections) && pastCorrections.length) {
    const lines = pastCorrections.slice(0, 12).map((c, i) => {
      const date = c.date ?? "?";
      const slot = c.slot ?? "?";
      const fromAI = c.fromAI ?? "(no AI value)";
      const toUser = c.toUser ?? "(slot removed entirely)";
      return `  ${i + 1}. [${date}] ${slot}: AI suggested "${fromAI}" → user changed to "${toUser}"`;
    }).join("\n");
    correctionsBlock = `\nPAST USER CORRECTIONS — these are real preference signals from Eias's actual override behavior. Learn from them: pieces the user removes are NOT preferred even if they score well; pieces the user swaps TO are preferred for that slot/context.\n${lines}\n`;
  }

  return `DATE: ${todayStr}
WEATHER: Current ${weather.tempC}°C. Morning: ${weather.tempMorning ?? "?"}°C, Midday: ${weather.tempMidday ?? "?"}°C, Evening: ${weather.tempEvening ?? "?"}°C. ${weather.description ?? ""}
${steerLine}${excludeBlock}${rejectedBlock}${correctionsBlock}
RECENT WATCHES WORN (avoid repeats):
${recentWatches || "No recent data"}

RECENT GARMENTS WORN (avoid repeats):
${recentGarments || "No recent data"}

WARDROBE (${garments.length} items):
${garmentList}

${variantClause}
Schema for each outfit:
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
}

function buildWhyPrompt({ currentPick, todayStr, weather }) {
  const o = currentPick ?? {};
  return `You are Eias's personal watch & outfit stylist. The user has the following outfit selected for ${todayStr} (${weather?.tempC ?? "?"}°C):

WATCH: ${o.watch ?? "?"} on ${o.strap ?? "?"} strap
TOP: ${o.shirt ?? o.sweater ?? "?"}
LAYER: ${o.jacket ?? o.layer ?? "none"}
PANTS: ${o.pants ?? "?"}
SHOES: ${o.shoes ?? "?"}

Explain in 2-3 sentences why this combination works — focus on color harmony with the dial, formality match, and weather suitability. Reply with plain text only, no JSON, no markdown.`;
}

export async function handler(event) {
  const CORS = cors(event);
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

    const body = event.httpMethod === "POST" ? JSON.parse(event.body ?? "{}") : {};
    const steer = typeof body.steer === "string" ? body.steer : null;
    const excludeRecent = Array.isArray(body.excludeRecent) ? body.excludeRecent : [];
    const rejected = body.rejected && typeof body.rejected === "object" ? body.rejected : null;
    // pastCorrections: array of { slot, fromAI, toUser, date } from user's
    // override history. Cap at 20 to bound prompt size; client typically sends
    // its synthesized list (most recent first) — we further trim in the prompt.
    const pastCorrections = Array.isArray(body.pastCorrections)
      ? body.pastCorrections.slice(0, 20).filter(c => c && typeof c === "object")
      : [];
    const why = body.why === true;
    const currentPick = body.currentPick && typeof body.currentPick === "object" ? body.currentPick : null;
    const variants = Math.max(1, Math.min(3, parseInt(body.variants, 10) || 1));

    // Any flexibility verb implies forceRefresh — never serve cache for these
    const forceRefresh = body.forceRefresh === true || !!steer || excludeRecent.length > 0 || !!rejected || pastCorrections.length > 0 || why || variants > 1;

    // Fire-and-forget: log rejection feedback for future preference-learning.
    // Stored under app_config key "ai_feedback_log" as a rolling list (tail 50).
    if (rejected) {
      (async () => {
        try {
          const { data: rows } = await supabase.from("app_config").select("value").eq("key", "ai_feedback_log").limit(1);
          const prev = Array.isArray(rows?.[0]?.value?.entries) ? rows[0].value.entries : [];
          const next = [{ at: new Date().toISOString(), outfit: rejected.outfit ?? null, reason: rejected.reason ?? null }, ...prev].slice(0, 50);
          await supabase.from("app_config").upsert({ key: "ai_feedback_log", value: { entries: next } }, { onConflict: "key" });
        } catch { /* logging failure is non-fatal */ }
      })();
    }

    // "Why this?" — short rationale request, no garment context fetch needed
    if (why && currentPick) {
      const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
      const model = await getConfiguredModel();
      const result = await callClaude(apiKey, {
        model,
        max_tokens: 250,
        messages: [{ role: "user", content: buildWhyPrompt({ currentPick, todayStr, weather: body.weather ?? currentPick.weather }) }],
      }, { maxAttempts: 1 });
      const text = extractText(result, "").trim();
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ rationale: text, generatedAt: new Date().toISOString() }) };
    }

    if (!forceRefresh) {
      try {
        const { data: cachedRows } = await supabase
          .from("app_config")
          .select("value")
          .eq("key", "daily_pick")
          .limit(1);
        const cached = cachedRows?.[0];
        if (cached?.value) {
          const pick = cached.value;
          const age = Date.now() - new Date(pick.generatedAt).getTime();
          if (age < 4 * 60 * 60 * 1000) {
            return { statusCode: 200, headers: CORS, body: JSON.stringify(pick) };
          }
        }
      } catch { /* cache miss — regenerate */ }
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
    const garmentList = (garments ?? []).map(g => {
      const t = g.type ?? g.category;
      return `${g.name} (${t}, ${g.color}, ${g.brand ?? "unbranded"}, formality:${g.formality ?? 5})`;
    }).join("\n");

    const recentWatches = (history ?? []).map(h =>
      `${h.date}: ${h.watch_id} — ${h.payload?.strapLabel ?? "unknown strap"}`
    ).join("\n");

    const recentGarments = (history ?? []).flatMap(h =>
      (h.payload?.garmentIds ?? []).map(id => {
        const g = (garments ?? []).find(x => x.id === id);
        return g ? `${h.date}: ${g.name}` : null;
      }).filter(Boolean)
    ).join("\n");

    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      todayStr,
      weather,
      garmentList,
      garments: garments ?? [],
      recentWatches,
      recentGarments,
      steer,
      excludeRecent,
      rejected,
      pastCorrections,
      variants,
    });

    const model = await getConfiguredModel();
    // Bumped from 800 → 2200 (4400 for variants) to give Opus 4.7 + adaptive
    // thinking room. If Netlify free-tier 10s timeout becomes an issue, dial
    // `effort` from "high" → "medium" or remove `thinking` entirely.
    const maxTokens = variants > 1 ? 2200 + (variants - 1) * 1500 : 2200;
    const result = await callClaude(apiKey, {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: userPrompt }],
    }, { maxAttempts: 1 });

    const text = extractText(result);
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to parse AI response", raw: text.slice(0, 500) }) };
    }

    const generatedAt = new Date().toISOString();

    if (variants > 1) {
      // Accept either a top-level array or { variants: [...] }
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.variants) ? parsed.variants : null);
      if (!arr || arr.length === 0) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Variants response was not an array", raw: text.slice(0, 500) }) };
      }
      const enriched = arr.slice(0, variants).map(p => ({ ...p, generatedAt, weather }));
      // Cache only the first variant under daily_pick for GET continuity
      try {
        await supabase.from("app_config").upsert({ key: "daily_pick", value: enriched[0] }, { onConflict: "key" });
      } catch {}
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ variants: enriched, generatedAt, weather }) };
    }

    const pick = parsed;
    pick.generatedAt = generatedAt;
    pick.weather = weather;
    if (steer) pick.steer = steer; // surface for debugging / UI affordance

    // Cache in app_config — but only when this is a "natural" pick (no steer / exclude / rejected)
    // so steered/regenerated picks don't poison the daily cache for other clients.
    if (!steer && excludeRecent.length === 0 && !rejected) {
      try {
        await supabase.from("app_config").upsert({ key: "daily_pick", value: pick }, { onConflict: "key" });
      } catch {}
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(pick) };
  } catch (err) {
    console.error("[daily-pick] Error:", err.message);
    const isBilling = err.message?.includes("BILLING");
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: isBilling ? err.message : "Daily pick generation failed" }) };
  }
}
