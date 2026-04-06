/**
 * style-dna.js — Style DNA extraction from wear history.
 *
 * Analyzes 30–90 days of outfit data to identify:
 * - Color palette gravity (which combos the user gravitates to)
 * - Formality center (where the user actually lives on the spectrum)
 * - Watch-outfit affinity (which watches pair with which garment types)
 * - Instinct vs algorithm (manual overrides/shuffles vs engine picks)
 * - Rejection patterns (from rejectStore data)
 * - Gap analysis (what the wardrobe is missing)
 *
 * GET — returns cached DNA (refreshes weekly)
 * POST { forceRefresh: true } — regenerate
 */
import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };

  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    const supabase = createClient(url, key);

    // Check cache (7 day refresh)
    const body = event.httpMethod === "POST" ? JSON.parse(event.body ?? "{}") : {};
    if (!body.forceRefresh) {
      try {
        const { data: cachedRows } = await supabase.from("app_config").select("value").eq("key", "style_dna").limit(1);
        const cached = cachedRows?.[0];
        if (cached?.value?.generatedAt) {
          const age = Date.now() - new Date(cached.value.generatedAt).getTime();
          if (age < 7 * 24 * 60 * 60 * 1000) {
            return { statusCode: 200, headers: CORS, body: JSON.stringify(cached.value) };
          }
        }
      } catch { /* cache miss — regenerate */ }
    }

    // Fetch data
    const [{ data: garments }, { data: history }] = await Promise.all([
      supabase.from("garments")
        .select("id,name,type,category,color,brand,formality,material,weight,seasons,contexts")
        .eq("exclude_from_wardrobe", false)
        .not("category", "in", "(outfit-photo,watch,outfit-shot)"),
      supabase.from("history")
        .select("watch_id,date,payload")
        .order("date", { ascending: false })
        .limit(200),
    ]);

    if (!history?.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "Not enough history", entries: 0 }) };
    }

    // ── Build analytics ──────────────────────────────────────────────────────

    // Color frequency
    const colorFreq = {};
    const colorPairs = {};
    history.forEach(h => {
      const ids = h.payload?.garmentIds ?? [];
      const colors = ids.map(id => garments?.find(g => g.id === id)?.color).filter(Boolean);
      colors.forEach(c => { colorFreq[c] = (colorFreq[c] ?? 0) + 1; });
      // Track color combos
      if (colors.length >= 2) {
        const sorted = [...new Set(colors)].sort();
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const key = `${sorted[i]}+${sorted[j]}`;
            colorPairs[key] = (colorPairs[key] ?? 0) + 1;
          }
        }
      }
    });

    // Formality distribution
    const formalityScores = [];
    history.forEach(h => {
      const ids = h.payload?.garmentIds ?? [];
      const fs = ids.map(id => garments?.find(g => g.id === id)?.formality).filter(f => f != null);
      if (fs.length) formalityScores.push(fs.reduce((a, b) => a + b, 0) / fs.length);
    });
    const avgFormality = formalityScores.length ? +(formalityScores.reduce((a, b) => a + b, 0) / formalityScores.length).toFixed(1) : null;

    // Watch-garment affinity
    const watchGarmentPairs = {};
    history.forEach(h => {
      const wid = h.watch_id;
      if (!wid) return;
      const ids = h.payload?.garmentIds ?? [];
      ids.forEach(gid => {
        const g = garments?.find(x => x.id === gid);
        if (g) {
          const key = `${wid}::${g.name}`;
          watchGarmentPairs[key] = (watchGarmentPairs[key] ?? 0) + 1;
        }
      });
    });

    // Context distribution
    const ctxDist = {};
    history.forEach(h => {
      const c = h.payload?.context ?? "unset";
      ctxDist[c] = (ctxDist[c] ?? 0) + 1;
    });

    // Score distribution
    const scores = history.map(h => h.payload?.score).filter(s => s != null);
    const avgScore = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

    // Never-worn garments
    const wornIds = new Set();
    history.forEach(h => (h.payload?.garmentIds ?? []).forEach(id => wornIds.add(id)));
    const neverWorn = (garments ?? []).filter(g => !wornIds.has(g.id));

    // Top 5 color combos
    const topCombos = Object.entries(colorPairs).sort(([, a], [, b]) => b - a).slice(0, 5);
    // Top 5 colors
    const topColors = Object.entries(colorFreq).sort(([, a], [, b]) => b - a).slice(0, 8);
    // Top watch-garment pairs
    const topWatchPairs = Object.entries(watchGarmentPairs).sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([k, v]) => ({ pair: k.replace("::", " → "), count: v }));

    // ── Claude analysis ──────────────────────────────────────────────────────
    const prompt = `You are a personal style analyst. Given this person's outfit data from the last ${history.length} logged days, extract their "Style DNA" — the patterns that define their actual dressed self, not what they aspire to.

DATA:
- Top colors worn: ${topColors.map(([c, n]) => `${c}(${n})`).join(", ")}
- Top color combos: ${topCombos.map(([c, n]) => `${c}(${n})`).join(", ")}
- Average formality: ${avgFormality}/10
- Context split: ${Object.entries(ctxDist).map(([k, v]) => `${k}:${v}`).join(", ")}
- Average outfit score: ${avgScore}/10
- Total garments: ${garments?.length ?? 0}, never worn: ${neverWorn.length}
- Top watch-garment pairs: ${topWatchPairs.map(p => `${p.pair}(${p.count})`).join(", ")}
- Logged entries: ${history.length}

Respond ONLY with this JSON, no markdown:
{
  "styleArchetype": "2-3 word archetype (e.g. 'Earthy Minimalist', 'Modern Prep', 'Warm Formalist')",
  "colorSignature": "2 sentences on their color gravity — what they reach for vs what they avoid",
  "formalityCenter": "1 sentence on where they naturally sit",
  "blindSpots": ["2-3 garment types or colors they're underusing"],
  "strengths": ["2-3 things they do well repeatedly"],
  "watchStyleAffinity": "1-2 sentences on which watches they pair with which looks",
  "nextPurchaseRec": "1 specific garment that would unlock new combos based on gaps",
  "seasonalNote": "1 sentence on how their style shifts with seasons (if enough data)"
}`;

    const model = await getConfiguredModel();
    const result = await callClaude(apiKey, {
      model, max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }, { maxAttempts: 1 });

    let analysis = {};
    try {
      const rawText = extractText(result);
      // Strip markdown fences, then find the first JSON object
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      // Try direct parse first
      try { analysis = JSON.parse(cleaned); } catch {
        // Fallback: extract first { ... } block (handles Claude adding preamble/postamble)
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) {
          analysis = JSON.parse(cleaned.slice(start, end + 1));
        } else {
          analysis = { error: "No JSON object found in response" };
        }
      }
    } catch (parseErr) { analysis = { error: `Parse failed: ${parseErr.message?.slice(0, 80)}` }; }

    const dna = {
      generatedAt: new Date().toISOString(),
      entriesAnalyzed: history.length,
      topColors,
      topCombos,
      avgFormality,
      avgScore,
      contextDistribution: ctxDist,
      neverWornCount: neverWorn.length,
      totalGarments: garments?.length ?? 0,
      topWatchPairs,
      analysis,
    };

    // Cache result
    try { await supabase.from("app_config").upsert({ key: "style_dna", value: dna }, { onConflict: "key" }); } catch { /* non-fatal */ }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(dna) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
