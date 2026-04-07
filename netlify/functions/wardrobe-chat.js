/**
 * wardrobe-chat.js — Conversational AI wardrobe advisor.
 * Sends user message + full wardrobe context to Claude, returns response.
 * Supports multi-turn conversation (client sends history array).
 *
 * POST body: { message, conversationHistory: [...], context: { weather, todayContext } }
 */
import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";


export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: '{"error":"POST only"}' };

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

  try {
    const body = JSON.parse(event.body ?? "{}");
    const userMessage = body.message;
    if (!userMessage) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "message required" }) };
    if (userMessage.length > 2000) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "message too long (max 2000 chars)" }) };

    if (Array.isArray(body.conversationHistory)) {
      const oversized = body.conversationHistory.some(m => typeof m.content === "string" && m.content.length > 500);
      if (oversized) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "conversationHistory message too long (max 500 chars each)" }) };
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    const supabase = createClient(url, key);

    // Fetch wardrobe data
    const [{ data: garments }, { data: history }] = await Promise.all([
      supabase.from("garments")
        .select("id,name,type,category,color,brand,formality,material,weight,seasons,contexts")
        .eq("exclude_from_wardrobe", false)
        .not("category", "in", "(outfit-photo,watch,outfit-shot)"),
      supabase.from("history")
        .select("watch_id,date,payload")
        .order("date", { ascending: false })
        .limit(60),
    ]);

    // Non-fatal optional data
    let dnaRow = null, reportRow = null;
    try {
      const r1 = await supabase.from("app_config").select("value").eq("key", "style_dna").limit(1);
      dnaRow = r1.data?.[0] ?? null;
    } catch {}
    try {
      const r2 = await supabase.from("app_config").select("value").eq("key", "monthly_report").limit(1);
      reportRow = r2.data?.[0] ?? null;
    } catch {}

    // Build context string
    const garmentList = (garments ?? []).map(g =>
      `${g.name} (${g.type ?? g.category}, ${g.color}, ${g.brand ?? "no brand"}, formality:${g.formality ?? 5}, material:${g.material ?? "?"}, weight:${g.weight ?? "?"})`
    ).join("\n");

    const garmentMap = new Map((garments ?? []).map(g => [g.id, g]));
    const recentWears = (history ?? []).slice(0, 20).map(h => {
      const gids = h.payload?.garmentIds ?? [];
      const names = gids.map(id => garmentMap.get(id)?.name).filter(Boolean);
      return `${h.date}: ${h.watch_id} — ${h.payload?.context ?? "?"} — ${names.join(", ") || "quick log"}`;
    }).join("\n");

    const styleDna = dnaRow?.value?.analysis && !dnaRow.value.analysis.error ? JSON.stringify(dnaRow.value.analysis) : "Not yet generated";
    const monthlyReport = reportRow?.value?.summary ? JSON.stringify(reportRow.value.summary) : "Not yet generated";

    // Server-side weather + context — don't rely on client props
    let weatherCtx = body.context?.weather ? `Current: ${body.context.weather.tempC}°C` : null;
    if (!weatherCtx) {
      try {
        const wRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=31.7683&longitude=35.2137&current=temperature_2m,weathercode&timezone=Asia/Jerusalem");
        const wData = await wRes.json();
        const temp = wData?.current?.temperature_2m;
        if (temp != null) weatherCtx = `Jerusalem ${temp}°C`;
      } catch { /* non-critical */ }
    }
    if (!weatherCtx) weatherCtx = "Unknown";

    // Infer context from Israel work week if not provided
    let todayCtx = body.context?.todayContext ?? null;
    if (!todayCtx) {
      const dow = new Date().getDay(); // 0=Sun..6=Sat
      todayCtx = (dow >= 0 && dow <= 4) ? "smart-casual (work day)" : "casual (weekend)";
    }

    const systemPrompt = `You are Eias's personal wardrobe and watch advisor. You have complete access to his wardrobe data and wear history. Answer questions with specific garment names, watch recommendations, and actionable advice.

WARDROBE (${garments?.length ?? 0} garments):
${garmentList}

WATCH COLLECTION (23 pieces — 13 genuine, 10 replica):
Genuine: GS Snowflake (silver-white), GS Rikka (green, bracelet broken → teal alligator default), Pasha 41 (grey), GP Laureato (blue, integrated), JLC Reverso (navy), Santos Large (white/gold), Santos Octagon (white, vintage YG), Tudor BB41 (black/red), TAG Monaco (black), GMT-Master II (black), Speedmaster 3861 (black), Hanhart Pioneer (white/teal), Laco Flieger (black)
Replica: IWC Perpetual (blue), IWC Ingenieur (teal), VC Overseas (burgundy), Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak (green), GMT Meteorite, Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

RECENT WEAR HISTORY (last 20):
${recentWears || "No recent data"}

STYLE DNA: ${styleDna}
MONTHLY INSIGHTS: ${monthlyReport}
TODAY'S CONTEXT: ${todayCtx}
WEATHER: ${weatherCtx}

RULES:
- Strap-shoe coordination is a GUIDELINE not a hard rule, but mention it when relevant
- No loafers ever
- Shift watches only: Speedmaster, BB41, Hanhart
- Pasha excluded from shifts
- Laco = casual/field only
- Replica watches fine for casual/flex/date night; genuine for clinic/formal
- Israel work week: Sunday = Monday equivalent, Friday = weekend start
- Layer logic: <10°C coat, <16°C sweater, <22°C light layer

Be specific, opinionated, and brief. Use actual garment names. Don't hedge.`;

    // Build messages array with conversation history
    const messages = [];
    if (body.conversationHistory?.length) {
      for (const msg of body.conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Build final user message — may include multiple images
    const images = Array.isArray(body.images) ? body.images : (body.image ? [body.image] : []);
    const imageBlocks = [];
    for (const imgData of images.slice(0, 4)) {
      if (typeof imgData !== "string" || !imgData.startsWith("data:image/")) continue;
      const match = imgData.match(/^data:(image\/[a-z]+);base64,(.+)$/i);
      if (match) {
        imageBlocks.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
      }
    }

    if (imageBlocks.length > 0) {
      messages.push({
        role: "user",
        content: [
          ...imageBlocks,
          { type: "text", text: userMessage || `What do you see in ${imageBlocks.length > 1 ? "these photos" : "this photo"}? Identify garments, watches, or outfit details.` },
        ],
      });
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    const model = await getConfiguredModel();
    const result = await callClaude(apiKey, {
      model,
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }, { maxAttempts: 1 });

    const responseText = extractText(result, "I couldn't generate a response.");

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ response: responseText }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
