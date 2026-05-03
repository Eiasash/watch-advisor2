import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";

// Exported for unit testing — see tests/dailyPickPersonalization.test.js
export { categorizeGarments };

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

PERSONALIZATION PRIORITY (when these sections appear in the user message):
- NEWLY ADDED — recently uploaded garments Eias hasn't worn yet. Strongly prefer one of these when context allows; he forgets new pieces if the AI doesn't surface them.
- NEVER WORN — owned but no history record. Treat as silent debt; rotate one in when weather + context fit.
- UNDER-WORN — 0–2 wears in the last 14 days. Default-prefer over OVER-ROTATED (5+ wears) for the same slot.
- PAST REJECTIONS — recent outfits Eias rejected with reasons. These are directional: avoid the underlying pattern (color clash, formality miss, watch+strap combo), not only the literal pieces.

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
 * Categorize garments by usage signal for personalization.
 *
 * Uses a 14-day wear window from history payload.garmentIds and a 30-day
 * "newness" window from garments.created_at. Output is capped per category
 * so the prompt stays bounded.
 *
 * @param {Array} garments        — current wardrobe rows (must include id, name, created_at)
 * @param {Array} history         — last 14 days of history (already filtered)
 * @param {object} [opts]
 * @param {number} [opts.newDays=30]      — created within N days = "new"
 * @param {number} [opts.underUsedMax=2]  — N wears or fewer in window = "under-worn"
 * @param {number} [opts.overUsedMin=5]   — N wears or more = "over-rotated"
 * @param {number} [opts.cap=8]           — max items per category in the prompt
 * @returns {{newlyAdded, neverWorn, underWorn, overRotated, wearCount}}
 */
function categorizeGarments(garments, history, opts = {}) {
  const newDays = opts.newDays ?? 30;
  const underUsedMax = opts.underUsedMax ?? 2;
  const overUsedMin = opts.overUsedMin ?? 5;
  const cap = opts.cap ?? 8;

  const wearCount = new Map();
  for (const h of history ?? []) {
    const ids = h?.payload?.garmentIds ?? [];
    for (const id of ids) wearCount.set(id, (wearCount.get(id) ?? 0) + 1);
  }

  const newCutoffMs = Date.now() - newDays * 86400000;
  const newlyAdded = [];
  const neverWorn = [];
  const underWorn = [];
  const overRotated = [];

  for (const g of garments ?? []) {
    if (!g?.id) continue;
    const wc = wearCount.get(g.id) ?? 0;
    const createdMs = g.created_at ? new Date(g.created_at).getTime() : NaN;
    const isNew = Number.isFinite(createdMs) && createdMs >= newCutoffMs;

    if (wc === 0 && isNew) {
      newlyAdded.push(g);
    } else if (wc === 0) {
      neverWorn.push(g);
    } else if (wc <= underUsedMax) {
      underWorn.push({ ...g, _wc: wc });
    } else if (wc >= overUsedMin) {
      overRotated.push({ ...g, _wc: wc });
    }
  }

  // Stable sorts: new = freshest first, neverWorn = oldest creation first
  // (closest to "I bought this for a reason but never used it"), underWorn =
  // fewest wears first, overRotated = most wears first.
  newlyAdded.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  neverWorn.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  underWorn.sort((a, b) => a._wc - b._wc);
  overRotated.sort((a, b) => b._wc - a._wc);

  return {
    newlyAdded: newlyAdded.slice(0, cap),
    neverWorn: neverWorn.slice(0, cap),
    underWorn: underWorn.slice(0, cap),
    overRotated: overRotated.slice(0, cap),
    wearCount,
  };
}

/**
 * VOLATILE per-call data: today's date, weather, recent history, wardrobe,
 * steer/exclude/rejected/pastCorrections feedback. Goes in the user message.
 */
function buildUserPrompt({ todayStr, weather, garmentList, garments, recentWatches, recentGarments, steer, excludeRecent, rejected, pastCorrections, variants, personalization, recentRejections }) {
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

  // Personalization sections — server-derived signals about wardrobe state.
  // Compact one-liners so the prompt stays bounded even when all 4 lists fill.
  const fmtItem = (g) => {
    const t = g.type ?? g.category ?? "?";
    const wc = g._wc != null ? `, worn ${g._wc}× last 14d` : "";
    return `  - ${g.name} (${t}, ${g.color ?? "?"}, formality:${g.formality ?? 5}${wc})`;
  };
  let personalizationBlock = "";
  if (personalization) {
    const sections = [];
    if (personalization.newlyAdded?.length) {
      sections.push(`NEWLY ADDED (uploaded recently, NOT yet worn — strongly prefer one of these when context allows):\n${personalization.newlyAdded.map(fmtItem).join("\n")}`);
    }
    if (personalization.neverWorn?.length) {
      sections.push(`NEVER WORN (owned, no history record — rotate one in when fit allows):\n${personalization.neverWorn.map(fmtItem).join("\n")}`);
    }
    if (personalization.underWorn?.length) {
      sections.push(`UNDER-WORN (0–2 wears in last 14 days — prefer over over-rotated):\n${personalization.underWorn.map(fmtItem).join("\n")}`);
    }
    if (personalization.overRotated?.length) {
      sections.push(`OVER-ROTATED (5+ wears in last 14 days — avoid unless explicitly the only fit):\n${personalization.overRotated.map(fmtItem).join("\n")}`);
    }
    if (sections.length) personalizationBlock = `\n${sections.join("\n\n")}\n`;
  }

  let recentRejectionsBlock = "";
  if (Array.isArray(recentRejections) && recentRejections.length) {
    const lines = recentRejections.slice(0, 5).map((e, i) => {
      const o = e.outfit ?? {};
      const w = o.watch ?? o.watchId ?? "?";
      const top = o.shirt ?? o.sweater ?? "?";
      const reason = (e.reason ?? "").slice(0, 100) || "(no reason)";
      const when = e.at ? new Date(e.at).toISOString().slice(0, 10) : "?";
      return `  ${i + 1}. [${when}] ${w} + ${top} + ${o.pants ?? "?"} + ${o.shoes ?? "?"} — "${reason}"`;
    }).join("\n");
    recentRejectionsBlock = `\nPAST REJECTIONS — Eias rejected these recently. Treat as directional signal (avoid the pattern, not just the literal pieces):\n${lines}\n`;
  }

  return `DATE: ${todayStr}
WEATHER: Current ${weather.tempC}°C. Morning: ${weather.tempMorning ?? "?"}°C, Midday: ${weather.tempMidday ?? "?"}°C, Evening: ${weather.tempEvening ?? "?"}°C. ${weather.description ?? ""}
${steerLine}${excludeBlock}${rejectedBlock}${correctionsBlock}${recentRejectionsBlock}${personalizationBlock}
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

    // Fetch garments + recent history + AI feedback log in parallel.
    // created_at is required for the "newly added" personalization signal.
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const [garmentsRes, historyRes, feedbackRes] = await Promise.all([
      supabase
        .from("garments")
        .select("id,name,type,category,color,brand,formality,material,weight,seasons,contexts,created_at")
        .eq("exclude_from_wardrobe", false)
        .not("category", "in", "(outfit-photo,watch,outfit-shot)"),
      supabase
        .from("history")
        .select("watch_id,date,payload")
        .gte("date", twoWeeksAgo)
        .order("date", { ascending: false }),
      // AI feedback log lives in app_config.value.entries — non-fatal if missing
      supabase.from("app_config").select("value").eq("key", "ai_feedback_log").limit(1),
    ]);
    const garments = garmentsRes.data;
    const history = historyRes.data;
    // Cap to last 5 rejections — older ones drift out of relevance and we
    // don't want to keep telling the model about a 3-month-old "too formal"
    // when the wardrobe and context have moved on.
    const recentRejections = (feedbackRes.data?.[0]?.value?.entries ?? []).slice(0, 5);

    // Weather from body or fetch
    let weather = body.weather ?? null;
    if (!weather) {
      try {
        const wRes = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=31.7683&longitude=35.2137&current_weather=true&hourly=temperature_2m&timezone=Asia/Jerusalem&forecast_days=2"
        );
        const wData = await wRes.json();
        const hourly = wData.hourly;
        // BUG FIX (2026-05-04): Open-Meteo returns hourly timestamps in
        // Asia/Jerusalem local time (because timezone=Asia/Jerusalem in the
        // query), but `new Date().toISOString().slice(0, 10)` returns UTC date.
        // After ~9pm UTC the dates diverge and the filter matches zero entries,
        // leaving tempMorning/Midday/Evening as null. The model then falls back
        // to current_weather.temperature (often a cold night reading) and gets
        // the day's outfit completely wrong. Use Jerusalem-local date instead.
        // Also bumped forecast_days 1 → 2 so we always have a full day of
        // forecast even when called late local-day.
        const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());
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

    // Personalization categorization — derived from the same garments + history
    // already fetched. No extra DB roundtrip. Capped per category in the helper.
    const personalization = categorizeGarments(garments ?? [], history ?? []);

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
      personalization,
      recentRejections,
    });

    // Inference settings tuned for Netlify free-tier 10s function ceiling.
    // Live measurement (2026-05-04): Sonnet 4.6 in this Netlify region runs ~40
    // tokens/sec. With 2200 max_tokens that's ~55s of generation alone — well
    // past the 10s ceiling regardless of effort/thinking knobs.
    //
    // Solution: hardcode Haiku 4.5 (not getConfiguredModel) for daily-pick only.
    // - Haiku is ~2.5-3x faster than Sonnet
    // - The structured JSON output with pre-labeled personalization signals is
    //   exactly Haiku's sweet spot — taste application, not deep reasoning
    // - getConfiguredModel() stays Sonnet for other callers (wardrobe-chat etc)
    //   that need its nuance
    //
    // max_tokens dropped 2200 → 800 (single) / 2000 (variants ×3): the actual
    // JSON payload is ~250 tokens; 2200 was an oversized budget the model
    // treated as license to ramble. Tighter cap = faster + cleaner output.
    //
    // If you want Sonnet quality back: upgrade Netlify Pro ($19/mo, 26s ceiling)
    // and revert the model line + max_tokens to use getConfiguredModel + 2200.
    const FAST_MODEL = "claude-haiku-4-5-20251001";
    const maxTokens = variants > 1 ? 800 + (variants - 1) * 600 : 800;
    // NOTE: output_config.effort is an Opus/Sonnet extended-thinking knob and
    // is rejected by Haiku 4.5 (live test 2026-05-04: 3 consecutive 500s in
    // ~1.2s = fast-fail at API level). Haiku doesn't need effort tuning anyway
    // — it's already fast and works well on structured-JSON output.
    const result = await callClaude(apiKey, {
      model: FAST_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
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
