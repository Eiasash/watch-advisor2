import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";
import { requireUser } from "./_auth.js";

// Exported for unit testing — see tests/dailyPickPersonalization.test.js,
// tests/dailyPickCache.test.js, tests/dailyPickPromptDiversity.test.js
export { categorizeGarments, computeCacheKey, cacheTtlMs, buildUserPrompt };

/**
 * Latency / observability helper (PR #147 — critique #10).
 *
 * Records a single metric entry to app_config["daily_pick_metrics"] as
 * a rolling tail of the last 100. Same pattern as ai_feedback_log.
 *
 * Captured per call:
 *   at:           ISO timestamp
 *   path:         "daily-pick" | "style-fixed-watch" (from event)
 *   date:         the date the pick is for (defaults to today Jerusalem)
 *   model:        which Claude model was used
 *   pinned:       boolean — was a pinnedWatch sent?
 *   variants:     int — how many variants requested
 *   cacheHit:     boolean — true if served from input-hash cache
 *   totalMs:      total handler duration
 *   claudeMs:     time spent waiting for Claude (0 on cache hit)
 *   inputTokens:  Claude input token count (from response.usage)
 *   outputTokens: Claude output token count
 *   promptChars:  prompt size as a sanity check on bloat
 *   status:       "ok" | "error" | "504" | "parse_fail"
 *   errorMsg:     short error string when status != "ok"
 *
 * Fire-and-forget — never throws, never blocks the response. Failures to
 * record are logged via console.warn (visible in Netlify function logs)
 * but do not surface to the user.
 */
async function recordMetric(supabase, metric) {
  if (!supabase) return;
  try {
    const { data: rows } = await supabase
      .from("app_config").select("value").eq("key", "daily_pick_metrics").limit(1);
    const prev = Array.isArray(rows?.[0]?.value?.entries) ? rows[0].value.entries : [];
    const next = [metric, ...prev].slice(0, 100); // tail-100
    await supabase
      .from("app_config")
      .upsert({ key: "daily_pick_metrics", value: { entries: next } }, { onConflict: "key" });
  } catch (err) {
    console.warn("[daily-pick] recordMetric failed:", err?.message);
  }
}
export { recordMetric }; // exported for unit tests

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

// v1.13.44 — quantitative formality floors/ceilings for steer (root cause: 2026-05-10 follow-up).
//
// Before this change, the steer text used soft verbs ("push toward",
// "relax") which Claude could obey or ignore depending on competing
// signals. When the user pinned a formality-9 watch (Reverso) and set
// context=Casual then clicked "More formal," Claude saw two equally weak
// signals (relax-toward-casual context vs. push-toward-formal steer) and
// chose whatever scored highest on color match — usually still a polo.
//
// Fix: bind each formality steer to a hard numeric threshold on garment
// formality. Cobalt-blue polos and tees (formality 3-5) cannot satisfy
// "more_formal" under this rule no matter how well they color-match the
// dial. Wardrobe-availability fallback is explicit so the AI doesn't
// freeze when the floor cannot be met — it picks the closest available.
//
// Floor/ceiling 5 chosen against the actual wardrobe distribution: 5 is
// the polo/casual-button-down tier; 6 is dress shirt; 7 is dressier shirt
// (Kiral pinstripe); 3-4 is t-shirt / casual graphic tee. The 5 boundary
// cleanly splits "shirt I'd wear to a wedding" from "shirt I'd wear to a
// beach" without splitting hairs over individual rows.
const STEER_INSTRUCTIONS = {
  more_casual: "Make this MORE CASUAL than your usual default. HARD CONSTRAINT: every chosen garment must have formality ≤ 5. Prefer t-shirts/polos (formality 3-5), chinos, sneakers/casual shoes/Chelsea boots. Reject dress shirts, dress trousers, leather oxfords/derbies with formality ≥ 6 — DO NOT pick them even if they match the watch better. If the wardrobe genuinely contains no garment ≤ 5 for a required slot (rare), pick the lowest-formality available item for that one slot and call it out in the reasoning.",
  more_formal: "Make this MORE FORMAL than your usual default. HARD CONSTRAINT: every chosen garment must have formality ≥ 6. Prefer dress shirts (formality 6-7), dress trousers/Kiral chinos, leather oxford/derby shoes. Reject t-shirts, polos, casual graphic tees with formality ≤ 5 — DO NOT pick them even if they color-match the watch dial perfectly. If the wardrobe genuinely contains no garment ≥ 6 for a required slot (rare), pick the highest-formality available item for that one slot and call it out in the reasoning.",
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
- Layer logic (Mediterranean climate — Jerusalem). The ONLY temperature that matters for the layer decision is **MORNING** (when Eias leaves the house). Ignore the overnight low; he is asleep at that time. Ignore the midday peak for the layer decision (it only determines layerTip).
  - Morning < 10°C   → coat (heavy: sweater + jacket + extra layer)
  - Morning 10-12°C  → sweater + jacket
  - Morning 13-21°C  → **formal/business context only**: light jacket (dress watches — Reverso, Laureato, Pasha, Santos, GP). Smart-casual, casual, and sport watches: **NO warmth layer at all** — no jacket, no sweater, no quarter-zip. The engine gates jacket on formality above 12°C, not just temperature. Do NOT add a jacket for Speedmaster, Hanhart, Laco, or any smart-casual/replica watch in this band.
  - Morning ≥ 22°C   → no extra layer
- If morning is in the 13-21°C band, midday rises ≥22°C, and the context is formal: include a jacket with a layerTip saying when to shed it. If morning is in the 10-12°C band, the sweater is correct but the jacket is the removable piece.
- Reverso Duoface: white dial for dark outfits (contrast), navy dial for light outfits (depth).
- Cable knit crewneck (black or ecru Kiral) = one level more formal than quarter-zip.
- Camel coat + ecru cable knit = tonal formal. Camel coat + black cable knit = contrast formal.

PERSONALIZATION PRIORITY (when these sections appear in the user message):
- NEWLY ADDED — recently uploaded garments Eias hasn't worn yet. Strongly prefer one of these when context allows; he forgets new pieces if the AI doesn't surface them.
- NEVER WORN — owned but no history record. Treat as silent debt; rotate one in when weather + context fit.
- UNDER-WORN — 0–2 wears in the last 14 days. Default-prefer over OVER-ROTATED (5+ wears) for the same slot.
- PAST REJECTIONS — recent outfits Eias rejected with reasons. These are directional: avoid the underlying pattern (color clash, formality miss, watch+strap combo), not only the literal pieces.

WATCH COLLECTION (25 pieces — 14 genuine, 11 replica):
Genuine: GS Snowflake (silver-white, Spring Drive), GS Rikka (green, Hi-Beat), Pasha 41 (grey), GP Laureato (blue, integrated bracelet), JLC Reverso (navy, moon phase), Santos Large (white/gold, QuickSwitch), Santos Octagon (white, vintage YG), Tudor BB41 (black/red), TAG Monaco (black), GMT-Master II (black), Speedmaster 3861 (black), Hanhart Pioneer (white/teal), Laco Flieger (black)
Replica: IWC Perpetual (blue), IWC Ingenieur (teal), VC Overseas (burgundy), Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak (green), GMT Meteorite, Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

OUTPUT SCHEMA — return ONLY valid JSON matching this shape:
{
  "watch": "exact watch name",
  "watchId": "watch_id — must EXACTLY match one of these (no brand prefixes, no underscores added): snowflake|rikka|pasha|laureato|reverso|santos_large|santos_octagon|blackbay|gp-vintage-1945|go-seventies-chrono|speedmaster|hanhart|laco|perception|iwc_perpetual|iwc_ingenieur|vc_overseas|santos_35|alpine_eagle|royal_oak|gmt_meteorite|daydate|op_grape|op_pistachio|breguet_tradition",
  "strap": "specific strap recommendation",
  "shirt": "garment id from the WARDROBE list (the value after 'id:' before ' | ') — or null",
  "sweater": "garment id or null",
  "layer": "garment id or null",
  "pants": "garment id",
  "shoes": "garment id",
  "jacket": "garment id or null",
  "belt": "garment id or null",
  "reasoning": "2-3 sentences explaining the outfit logic — color harmony, watch dial pairing, weather transition advice",
  "score": 8.5,
  "layerTip": "e.g. 'Shed the quarter-zip after noon — 17°C midday' or null"
}

Pay close attention to the PAST CORRECTIONS section in the user message if present — those are direct signals about Eias's actual preferences that should override your defaults.`;
}

/**
 * Build a stable cache key from the inputs that determine recommendation
 * identity. Two requests with identical date + pinned watch + weather +
 * wardrobe state + history state should produce equivalent picks; cache
 * lets us skip the Claude call (~6s) when nothing meaningful changed.
 *
 * Why these specific inputs:
 *   - date: a pick is for a specific day
 *   - pinnedWatchId: WeekPlanner's day.watch — different watch = different pick
 *   - weatherSig: rounded morning/midday/evening (to avoid micro-degree churn)
 *   - garmentsSig: count + max created_at — proxies "wardrobe state version"
 *   - historySig: count + most-recent date — proxies "wear history version"
 *
 * Anything not in this key (steer / rejected / excludeRecent) is handled by
 * bypassing the cache entirely for those verbs — see callers.
 *
 * Single-user app: cache key intentionally omits user identity. If multi-user
 * support is ever added, include auth.uid / email in the key to prevent two
 * users with similar wardrobe sizes from sharing entries.
 */
function computeCacheKey({ date, pinnedWatchId, weather, garments, history }) {
  const wsig = weather
    ? `${Math.round(weather.tempMorning ?? weather.tempC ?? 0)}-${Math.round(weather.tempMidday ?? 0)}-${Math.round(weather.tempEvening ?? 0)}`
    : "nw";
  const list = garments ?? [];
  // gsig must change when any field that the AI prompt sees changes — not just
  // when garments are added/removed. The prompt formats each garment as
  // `${name} (${type/category}, ${color}, ${brand}, formality:${formality})`,
  // so an edit to color/formality/category that the user makes via
  // GarmentEditor must produce a different cache key. Otherwise the user
  // edits a garment, asks Claude again, and gets the pre-edit answer for up
  // to 4h (today TTL). Bug fix May 5 2026 — was previously
  //   `${length}-${maxCreatedAt}`
  // which only tracked add/remove, not in-place edits.
  let maxCreatedAt = 0;
  // 32-bit FNV-1a accumulator, order-independent across the wardrobe via XOR
  // sum. Order independence is correct for our use: the prompt re-derives
  // ordering from each request, so two wardrobes with the same content in
  // different array orders should produce the same recommendation.
  let contentXor = 0;
  for (const g of list) {
    if (!g) continue;
    if (g.created_at) {
      const t = new Date(g.created_at).getTime();
      if (t > maxCreatedAt) maxCreatedAt = t;
    }
    const sig = [
      g.id ?? "",
      g.name ?? "",
      g.color ?? "",
      g.formality ?? "",
      g.type ?? g.category ?? "",
      g.brand ?? "",
    ].join("|");
    let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
    for (let i = 0; i < sig.length; i++) {
      h ^= sig.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    contentXor = (contentXor ^ h) >>> 0;
  }
  const contentHex = contentXor.toString(16).padStart(8, "0");
  const gsig = `${list.length}-${maxCreatedAt}-${contentHex}`;
  // history is sorted desc by date, so [0].date is the most recent
  const hsig = `${(history ?? []).length}-${history?.[0]?.date ?? ""}`;
  const watchPart = pinnedWatchId ?? "open";
  // Keep key under Postgres's index limits — readable, not hashed wholesale
  // (8-char content hex stays grep-friendly when something looks stale).
  return `daily_pick_cache:${date}:${watchPart}:${wsig}:${gsig}:${hsig}`;
}

/**
 * TTL for cached picks in milliseconds.
 *   today (Jerusalem-local) = 4 hours (matches the legacy daily_pick cache)
 *   future days             = 24 hours (forecast doesn't update minute-by-minute)
 */
function cacheTtlMs(dateStr) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());
  return dateStr === today ? 4 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
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
function buildUserPrompt({ todayStr, weather, garmentList, garments, recentWatches, recentGarments, steer, excludeRecent, rejected, pastCorrections, variants, personalization, recentRejections, pinnedWatch, availableWatches, pinnedSlots }) {
  const variantClause = variants > 1
    ? `Return a JSON ARRAY of ${variants} DISTINCT outfit objects (each must use a different watch). Do NOT wrap in markdown.`
    : "Respond ONLY with a single JSON object, no markdown.";

  const steerLine = steer && STEER_INSTRUCTIONS[steer]
    ? `\nFLEXIBILITY DIRECTIVE: ${STEER_INSTRUCTIONS[steer]}\n`
    : "";

  let excludeBlock = "";
  let colorRotationBlock = "";
  if (Array.isArray(excludeRecent) && excludeRecent.length) {
    const lines = excludeRecent.slice(0, 6).map((p, i) => {
      if (typeof p === "string") return `  ${i + 1}. ${p}`;
      const w = p.watch ?? p.watchId ?? "?";
      const top = p.shirt ?? p.sweater ?? "?";
      return `  ${i + 1}. ${w} + ${top} + ${p.pants ?? "?"} + ${p.shoes ?? "?"}`;
    }).join("\n");
    excludeBlock = `\nDO NOT REPEAT these recent suggestions — pick something genuinely different:\n${lines}\n`;

    // v1.13.43 — DIVERSITY ENFORCEMENT (root cause: 2026-05-10 stuck-loop bug).
    //
    // Without this block, "Try another"/"Different one" sees Claude swap one
    // newly-added cobalt-blue shirt for the OTHER newly-added cobalt-blue shirt
    // and consider that "different" — different garment id, same perceived look.
    // The user's frustration is "all the buttons do nothing"; the AI is
    // technically obeying the exclude, but the NEWLY ADDED + color-match-to-dial
    // pressure traps it in one color family.
    //
    // Fix: when ≥2 recent picks share a shirt color, surface the over-used
    // colors explicitly and instruct Claude that variety beats freshness on
    // this turn. Only kicks in once a stuck pattern is observable, so normal
    // first-time picks are unaffected.
    if (excludeRecent.length >= 2 && Array.isArray(garments) && garments.length) {
      // Build name + id lookup once. Keys are lowercased+trimmed. We accept
      // either the AI's chosen id or its name (compactPickForExclude sends
      // whatever the AI returned, which can be either form).
      const colorByRef = new Map();
      for (const g of garments) {
        if (!g) continue;
        const c = (g.color ?? "").toString().toLowerCase().trim();
        if (!c) continue;
        if (g.id) colorByRef.set(String(g.id).toLowerCase().trim(), c);
        if (g.name) colorByRef.set(String(g.name).toLowerCase().trim(), c);
      }
      const shirtColorCounts = new Map();
      for (const p of excludeRecent.slice(0, 6)) {
        if (!p || typeof p !== "object") continue;
        const ref = (p.shirt ?? p.sweater ?? "").toString().toLowerCase().trim();
        if (!ref) continue;
        const color = colorByRef.get(ref);
        if (!color) continue;
        shirtColorCounts.set(color, (shirtColorCounts.get(color) ?? 0) + 1);
      }
      const overUsedColors = [...shirtColorCounts.entries()]
        .filter(([_c, n]) => n >= 2)
        .map(([c]) => c);
      if (overUsedColors.length) {
        colorRotationBlock = `\nDIVERSITY ENFORCEMENT — these shirt color(s) appeared in multiple recent picks: ${overUsedColors.join(", ")}. The user has cycled through them and perceives them as "the same shirt." Pick a SHIRT WITH A DIFFERENT COLOR FAMILY this turn. Variety beats freshness here — even if a NEWLY ADDED option matches one of these colors, prefer a different-color shirt (newly added or not). This single instruction overrides the "strongly prefer NEWLY ADDED" preference for the shirt slot only on this turn.\n`;
      }
    }
  }

  let rejectedBlock = "";
  if (rejected && (rejected.outfit || rejected.reason)) {
    const o = rejected.outfit ?? {};
    const w = o.watch ?? o.watchId ?? "(unknown watch)";
    rejectedBlock = `\nUSER REJECTED a prior suggestion (${w} + ${o.shirt ?? o.sweater ?? "?"} + ${o.pants ?? "?"} + ${o.shoes ?? "?"}). Reason: "${rejected.reason ?? "no reason given"}". Avoid the same direction.\n`;
  }

  // Watch pinning: when WeekPlanner pre-selects a watch via deterministic
  // rotation (e.g. most-idle), the model MUST use that exact watch. Without
  // this, the model picks its own watch and the planner UI ends up displaying
  // the planner's watch alongside reasoning text about a different one — the
  // 2026-05-04 BB41/Rikka mismatch incident.
  // PR #162 — when client sends availableWatches (Different-watch mode),
  // skip the PINNED block entirely and instead list candidates Claude may
  // pick from. Mutually exclusive with pinnedWatch — client never sends both.
  let availableWatchesBlock = "";
  if (Array.isArray(availableWatches) && availableWatches.length > 0 && !pinnedWatch) {
    const lines = availableWatches.slice(0, 30).map((w, i) => {
      const strapsTxt = Array.isArray(w.straps) && w.straps.length
        ? w.straps.map(s => s.label).join(" / ")
        : "default";
      return `  ${i + 1}. id="${w.id}" — ${w.brand} ${w.model} · ${w.dial ?? "?"} dial · ${w.style ?? "?"} · formality ${w.formality ?? 5}/10 · straps: ${strapsTxt}`;
    }).join("\n");
    availableWatchesBlock = `\nAVAILABLE WATCHES (the user wants a different watch — pick ONE from this list):\n${lines}\nSet "watchId" in your response to the chosen watch's id (exact string match), and "watch" to its display label. Set "strap" to one of the chosen watch's available straps. Reasoning must mention the chosen watch by name and explain why it suits the outfit.\n`;
  }

  let pinnedWatchBlock = "";
  if (pinnedWatch && typeof pinnedWatch === "object" && pinnedWatch.id) {
    const w = pinnedWatch;
    const strapsTxt = Array.isArray(w.straps) && w.straps.length
      ? w.straps.map(s => `${s.label} (${s.color}, ${s.type})`).join("; ")
      : "default";
    // PR #160 — when the client passes the user's currently-selected strap,
    // tell Claude to USE that strap (not pick a different one) and to reference
    // it explicitly in the reasoning. Otherwise Claude freelances and the prose
    // ends up describing a strap the user didn't pick.
    const cs = w.currentStrap;
    const currentStrapBlock = cs && typeof cs === "object" && cs.label
      ? `\n  CURRENTLY ON THE WATCH: ${cs.label}${cs.color ? ` (${cs.color}` : ""}${cs.type ? `${cs.color ? ", " : " ("}${cs.type}` : ""}${cs.color || cs.type ? ")" : ""}\n  → Use THIS strap. Set the "strap" field in your response to "${cs.label}". In the reasoning, mention this strap by name and explain how it coordinates with the outfit. Do NOT suggest a different strap.`
      : `\n  → No strap selected by user — pick the best one from the available straps and set "strap" in your response.`;
    pinnedWatchBlock = `\nPINNED WATCH (use EXACTLY this — do NOT pick a different watch):
  watch: ${w.brand} ${w.model}
  watchId: ${w.id}
  dial: ${w.dial ?? "?"}
  style: ${w.style ?? "?"} · formality ${w.formality ?? 5}/10
  straps available: ${strapsTxt}${currentStrapBlock}
Your job is to pick the OUTFIT (clothes + strap choice from the available straps), NOT the watch. The "watch" and "watchId" fields in your response MUST match the pinned values above.\n`;
  }

  // v1.13.13 — current-day user pins. The user manually picked one or more
  // outfit slots (e.g. "I want this sweater today"); refit the OTHER slots
  // around them. Without this, "Try another" replaced the user's manual
  // pick because Claude had no signal that those slots were intentional.
  // Companion to v1.13.10's revert of the AI auto-refit on garment change —
  // the engine path already honors pinnedSlots, this brings the AI path
  // into parity.
  let pinnedSlotsBlock = "";
  if (pinnedSlots && typeof pinnedSlots === "object") {
    const lines = Object.entries(pinnedSlots)
      .filter(([_slot, name]) => typeof name === "string" && name.trim().length > 0)
      .slice(0, 7)
      .map(([slot, name]) => `  ${slot}: "${name}"`);
    if (lines.length > 0) {
      pinnedSlotsBlock = `\nCURRENT-DAY USER PICKS (the user manually chose these — KEEP THEM EXACTLY, refit the other slots around them):\n${lines.join("\n")}\nIn your response, set the pinned slot fields to the EXACT names above. Pick the remaining slots + strap to harmonize with these fixed pieces. Do NOT suggest alternatives for the pinned slots.\n`;
    }
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
  // Include id so AI can refer back to the same garment in its response — same
  // format as the WARDROBE block.
  const fmtItem = (g) => {
    const t = g.type ?? g.category ?? "?";
    const wc = g._wc != null ? `, worn ${g._wc}× last 14d` : "";
    return `  - id:${g.id} | ${g.name} (${t}, ${g.color ?? "?"}, formality:${g.formality ?? 5}${wc})`;
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
${steerLine}${pinnedWatchBlock}${pinnedSlotsBlock}${availableWatchesBlock}${excludeBlock}${colorRotationBlock}${rejectedBlock}${correctionsBlock}${recentRejectionsBlock}${personalizationBlock}
RECENT WATCHES WORN (avoid repeats):
${recentWatches || "No recent data"}

RECENT GARMENTS WORN (avoid repeats):
${recentGarments || "No recent data"}

WARDROBE (${garments.length} items) — each line is "id:<id> | <Name> (<type>, <color>, <brand>, formality:N)". For shirt/sweater/pants/etc, **return the id (the value after "id:" before " | ")** — for example pants="g_manual_navy_slim_chino". If you absolutely must return a name, copy the name VERBATIM (the part between " | " and " ("); abbreviations like "navy pants" or "olive shirt" will NOT match. Do not invent items not in this list.
${garmentList}

${variantClause}
Schema for each outfit:
{
  "watch": "exact watch name",
  "watchId": "watch_id — must EXACTLY match one of these (no brand prefixes, no underscores added): snowflake|rikka|pasha|laureato|reverso|santos_large|santos_octagon|blackbay|gp-vintage-1945|go-seventies-chrono|speedmaster|hanhart|laco|perception|iwc_perpetual|iwc_ingenieur|vc_overseas|santos_35|alpine_eagle|royal_oak|gmt_meteorite|daydate|op_grape|op_pistachio|breguet_tradition",
  "strap": "specific strap recommendation",
  "shirt": "garment id from the WARDROBE list (the value after 'id:' before ' | ') — or null",
  "sweater": "garment id or null",
  "layer": "garment id or null",
  "pants": "garment id",
  "shoes": "garment id",
  "jacket": "garment id or null",
  "belt": "garment id or null",
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

  // Auth gate (rollout-flagged via AUTH_GATE_ENABLED env var; see _auth.js).
  // When the flag is unset/false the gate returns success without checking,
  // preserving pre-rollout behavior. Flip the env var on Netlify dashboard
  // to activate the gate after confirming GitHub sign-in works.
  const auth = await requireUser(event);
  if (auth.error) {
    return { statusCode: auth.statusCode, headers: CORS, body: JSON.stringify({ error: auth.error }) };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
  }

  // Latency observability — captured here so the recordMetric call at end
  // can compute totalMs even when the handler errors out partway through.
  const handlerStart = Date.now();
  // event.path is "/.netlify/functions/daily-pick" or "/.netlify/functions/style-fixed-watch"
  const endpointPath = (event?.path ?? "").includes("style-fixed-watch") ? "style-fixed-watch" : "daily-pick";
  let supabaseForMetrics = null; // assigned in try so the catch block can record errors

  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    const supabase = createClient(url, key);
    supabaseForMetrics = supabase;

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
    // Pinned watch: WeekPlanner sends day.watch so the AI generates outfit FOR
    // that watch instead of picking its own. Accepts either a full watch object
    // or just an id (in which case we resolve from the wardrobe later — but
    // WeekPlanner currently sends the whole object, which is preferred).
    const pinnedWatch = body.pinnedWatch && typeof body.pinnedWatch === "object" && body.pinnedWatch.id
      ? body.pinnedWatch
      : null;
    // PR #162 — when steer="different_watch", client sends availableWatches
    // and omits pinnedWatch. Server lists those in the prompt so Claude can
    // pick a different watch entirely (the "Different watch" chip's intent).
    const availableWatches = Array.isArray(body.availableWatches)
      ? body.availableWatches.filter(w => w && typeof w === "object" && w.id).slice(0, 30)
      : [];
    // v1.13.13 — current-day user pins. Map of {slot: name} the user wants
    // KEPT EXACTLY in the AI's response. Filtered to the 7 valid slot names
    // + non-empty string values to bound prompt size and reject malformed
    // input. Pairs with the engine path's pinnedSlotGarments behavior so the
    // Plan tab's "Try another" finally honors user picks.
    const VALID_PIN_SLOTS = new Set(["shirt","pants","shoes","jacket","sweater","layer","belt"]);
    const pinnedSlots = body.pinnedSlots && typeof body.pinnedSlots === "object"
      ? Object.fromEntries(
          Object.entries(body.pinnedSlots)
            .filter(([slot, name]) => VALID_PIN_SLOTS.has(slot) && typeof name === "string" && name.trim().length > 0)
            .map(([slot, name]) => [slot, name.slice(0, 100)])
        )
      : null;
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

    // "Why this?" — short rationale request, no garment context fetch needed.
    // v1.13.12 — `body.weather` only; do NOT fall back to currentPick.weather.
    // Reason: currentPick.weather is the weather AT TIME OF PICK, often hours
    // stale. If the user revisits "why" later in the day after the forecast
    // has updated, the reasoning text would describe yesterday's morning
    // ("wear a heavy sweater for the cold morning" while it's actually 24°C
    // now). Trust the client's freshly-fetched body.weather; if missing, omit.
    if (why && currentPick) {
      const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
      const model = await getConfiguredModel();
      const result = await callClaude(apiKey, {
        model,
        max_tokens: 250,
        messages: [{ role: "user", content: buildWhyPrompt({ currentPick, todayStr, weather: body.weather ?? null }) }],
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
    // Guard: if the wardrobe query explicitly failed (data===null = Supabase error),
    // the WARDROBE block is empty and the model will hallucinate generic names.
    // data===[] (empty wardrobe / new user) is allowed through — Claude will say
    // there are no garments, which is the correct UX.
    if (garments === null) {
      const reason = garmentsRes.error?.message ?? "query failed";
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `Wardrobe unavailable (${reason}) — retry` }) };
    }
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
          "https://api.open-meteo.com/v1/forecast?latitude=31.7683&longitude=35.2137&current_weather=true&hourly=temperature_2m&timezone=Asia/Jerusalem&forecast_days=2",
          { signal: AbortSignal.timeout(5000) }
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

    // Build garment summary. Each line is `id:<id> | <name> (<type>, <color>, <brand>, formality:N)`.
    // The id-prefix is the v1.13.20 fix for the May 7 hallucination class:
    // when the AI returned `pants: "navy pants"` we couldn't match it because
    // the wardrobe entry was `Lee Cooper Navy Slim Chino`. Now the AI is
    // instructed to return the id (preferred) or fall back to the exact name.
    // The resolver tries id-match first, then name-match, so old prompt-cached
    // responses still work.
    const garmentList = (garments ?? []).map(g => {
      const t = g.type ?? g.category;
      return `id:${g.id} | ${g.name} (${t}, ${g.color}, ${g.brand ?? "unbranded"}, formality:${g.formality ?? 5})`;
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

    // ── Input-hashed cache (PR #145) ───────────────────────────────────────
    // Bypass cache when the user explicitly asked for something different.
    // Bug fix v1.13.5 (audit-fix-deploy 2026-05-05): the previous skipCache
    // condition was a strict subset of `forceRefresh` (line 515), so callers
    // sending `forceRefresh:true` (e.g. WeekPlanner's "Ask Claude" action,
    // see WeekPlanner.jsx handleAskClaude line 1440) would correctly skip the
    // legacy 4-hour cache at line 543 but still HIT the input-hash cache —
    // returning a stale pick from earlier in the day. `pastCorrections` had
    // the same problem: legacy bypassed, input-hash served. Unify by reusing
    // forceRefresh, which is the single source of truth for "client wants
    // fresh model output regardless of equivalent inputs".
    const skipCache = forceRefresh;
    const cacheKeyDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const inputCacheKey = computeCacheKey({
      date: cacheKeyDate,
      pinnedWatchId: pinnedWatch?.id ?? null,
      weather,
      garments: garments ?? [],
      history: history ?? [],
    });
    if (!skipCache) {
      try {
        const { data } = await supabase.from("app_config").select("value").eq("key", inputCacheKey).limit(1);
        const cached = data?.[0]?.value;
        if (cached?.generatedAt) {
          const age = Date.now() - new Date(cached.generatedAt).getTime();
          if (age < cacheTtlMs(cacheKeyDate)) {
            // Mark cache hit explicitly so client-side latency observability
            // can distinguish "model returned in 6s" from "cache returned in 100ms".
            // Fire-and-forget metric for the cache-hit path.
            recordMetric(supabase, {
              at: new Date().toISOString(),
              path: endpointPath,
              date: cacheKeyDate,
              model: "(cache)",
              pinned: !!pinnedWatch,
              variants,
              cacheHit: true,
              totalMs: Date.now() - handlerStart,
              claudeMs: 0,
              inputTokens: 0,
              outputTokens: 0,
              promptChars: 0,
              status: "ok",
              errorMsg: null,
            });
            return { statusCode: 200, headers: CORS, body: JSON.stringify({ ...cached, cardSource: "ai_rec_cached", cacheKey: inputCacheKey }) };
          }
        }
      } catch { /* cache miss — regenerate */ }
    }

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
      pinnedWatch,
      availableWatches,
      pinnedSlots,
    });

    // Inference settings — back on Haiku 4.5 + 800 tokens after PR #142's
    // Sonnet revert produced live 504s (debug log 2026-05-04 04:45 UTC: two
    // /daily-pick calls 31s apart, both 504 "Inactivity Timeout"). Even on
    // Pro tier (nf_team_pro), Sonnet + adaptive thinking + effort:high + 2200
    // tokens does NOT reliably fit under the actual edge-proxy ceiling (~30s
    // observed, regardless of what Netlify docs claim about 26s).
    //
    // Sequence:
    //   PR #131/#132: Haiku + 800 tokens (worked, ~6s)
    //   PR #142: Sonnet + thinking + high + 2200 (broke — 504 in production)
    //   THIS PR: back to Haiku + 800 tokens (rollback)
    //
    // Personalization signals (PR #128) + pinnedWatch (PR #141) carry the
    // structural reasoning; Haiku handles taste application well enough on
    // pre-labeled context. The reasoning-prose nuance gain from Sonnet wasn't
    // worth the 504-rate.
    //
    // To re-attempt Sonnet later: try effort:medium + NO thinking + max_tokens
    // 1500 first. Or wait for Anthropic priority routing on the prompt.
    const FAST_MODEL = "claude-haiku-4-5-20251001";
    const maxTokens = variants > 1 ? 800 + (variants - 1) * 600 : 800;
    // output_config.effort is Opus/Sonnet-only; Haiku 4.5 rejects it (PR #132).
    const claudeStart = Date.now();
    const result = await callClaude(apiKey, {
      model: FAST_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }, { maxAttempts: 1 });
    const claudeMs = Date.now() - claudeStart;

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
    pick.cardSource = "ai_rec"; // PR #145 — provenance field for UI labeling
    if (steer) pick.steer = steer; // surface for debugging / UI affordance

    // Cache writes — two parallel locations:
    //   1. legacy "daily_pick" key — kept for back-compat with ClaudePick GET
    //   2. new inputCacheKey — hash of (date, pinned watch, weather, wardrobe state)
    if (!skipCache) {
      try {
        await supabase.from("app_config").upsert({ key: "daily_pick", value: pick }, { onConflict: "key" });
        await supabase.from("app_config").upsert({ key: inputCacheKey, value: pick }, { onConflict: "key" });
      } catch {}
    }

    // Latency metric — fire-and-forget after response is queued.
    recordMetric(supabase, {
      at: new Date().toISOString(),
      path: endpointPath,
      date: cacheKeyDate,
      model: FAST_MODEL,
      pinned: !!pinnedWatch,
      variants,
      cacheHit: false,
      totalMs: Date.now() - handlerStart,
      claudeMs,
      inputTokens: result?.usage?.input_tokens ?? 0,
      outputTokens: result?.usage?.output_tokens ?? 0,
      promptChars: userPrompt.length,
      status: "ok",
      errorMsg: null,
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify(pick) };
  } catch (err) {
    console.error("[daily-pick] Error:", err.message);
    const isBilling = err.message?.includes("BILLING");
    // Error metric — captures wall-clock + error class so we can spot
    // patterns (504-shaped vs auth-shaped vs Claude-shaped).
    recordMetric(supabaseForMetrics, {
      at: new Date().toISOString(),
      path: endpointPath,
      date: null,
      model: null,
      pinned: false,
      variants: 1,
      cacheHit: false,
      totalMs: Date.now() - handlerStart,
      claudeMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      promptChars: 0,
      status: isBilling ? "billing" : "error",
      errorMsg: String(err?.message ?? "").slice(0, 250),
    });
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: isBilling ? err.message : "Daily pick generation failed" }) };
  }
}
