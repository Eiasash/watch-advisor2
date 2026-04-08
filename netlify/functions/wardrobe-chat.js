/**
 * wardrobe-chat.js — Conversational AI wardrobe advisor + action executor.
 * Supports multi-turn conversation, photo input, and performing real wardrobe actions
 * (fix garment tags, exclude garments, add straps, fix history entries).
 *
 * POST body: { message, conversationHistory, context: { weather, todayContext }, images }
 * Response:  { response, actions[], clientActions[] }
 */
import { callClaude, getConfiguredModel, extractText } from "./_claudeClient.js";
import { createClient } from "@supabase/supabase-js";
import { cors } from "./_cors.js";

// ── Tool definitions for Claude ────────────────────────────────────────────
const TOOLS = [
  {
    name: "update_garment",
    description: "Fix or update a garment's metadata: name, color, type, formality, material, weight, seasons, contexts, notes. Use when the user asks to fix tags, rename, change formality, or update any garment property.",
    input_schema: {
      type: "object",
      properties: {
        garment_id: { type: "string", description: "The garment ID from the wardrobe list" },
        updates: {
          type: "object",
          description: "Fields to update — only include fields that need changing",
          properties: {
            name:      { type: "string" },
            color:     { type: "string" },
            type:      { type: "string", enum: ["shirt","pants","sweater","jacket","shoes","belt","accessory","bag"] },
            formality: { type: "number", minimum: 1, maximum: 10 },
            material:  { type: "string" },
            weight:    { type: "string", enum: ["ultralight","light","medium","heavy"] },
            seasons:   { type: "array", items: { type: "string", enum: ["spring","summer","autumn","winter"] } },
            contexts:  { type: "array", items: { type: "string", enum: ["clinic","smart-casual","formal","shift","casual","date-night","riviera","eid-celebration","family-event"] } },
            notes:     { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["garment_id", "updates"],
    },
  },
  {
    name: "exclude_garment",
    description: "Remove a garment from the active wardrobe — it won't appear in outfit suggestions. Use for garments that are damaged, donated, sold, or temporarily out of rotation.",
    input_schema: {
      type: "object",
      properties: {
        garment_id: { type: "string" },
        reason:     { type: "string" },
      },
      required: ["garment_id"],
    },
  },
  {
    name: "reactivate_garment",
    description: "Bring an excluded garment back into the active wardrobe.",
    input_schema: {
      type: "object",
      properties: { garment_id: { type: "string" } },
      required: ["garment_id"],
    },
  },
  {
    name: "add_strap",
    description: "Add a new strap to a watch. This is a client-side action — it updates the local strap store.",
    input_schema: {
      type: "object",
      properties: {
        watch_id:  { type: "string", description: "Watch ID: snowflake, rikka, pasha, laureato, reverso, santos_large, santos_octagon, blackbay, monaco, gmt, speedmaster, hanhart, laco" },
        label:     { type: "string", description: "Display label, e.g. 'Brown leather'" },
        color:     { type: "string" },
        type:      { type: "string", enum: ["leather","bracelet","nato","canvas","rubber","suede"] },
        use_case:  { type: "string", description: "When to wear it" },
      },
      required: ["watch_id", "label", "color", "type"],
    },
  },
  {
    name: "fix_history_entry",
    description: "Fix a history entry: mark as legacy (removes from orphan/rating queue), update the score, or update the context.",
    input_schema: {
      type: "object",
      properties: {
        entry_id: { type: "string" },
        action:   { type: "string", enum: ["mark_legacy", "update_score", "update_context"] },
        score:    { type: "number", minimum: 1, maximum: 10, description: "Required when action=update_score" },
        context:  { type: "string", description: "Required when action=update_context" },
      },
      required: ["entry_id", "action"],
    },
  },
];


// ── Tool executor (server-side Supabase actions) ───────────────────────────
async function executeTool(supabase, toolName, input) {
  switch (toolName) {
    case "update_garment": {
      const { garment_id, updates } = input;
      const dbUpdates = {};
      if (updates.name      != null) dbUpdates.name     = updates.name;
      if (updates.color     != null) dbUpdates.color    = updates.color;
      if (updates.type      != null) { dbUpdates.type = updates.type; dbUpdates.category = updates.type; }
      if (updates.formality != null) dbUpdates.formality = updates.formality;
      if (updates.material  != null) dbUpdates.material  = updates.material;
      if (updates.weight    != null) dbUpdates.weight    = updates.weight;
      if (updates.seasons   != null) dbUpdates.seasons   = updates.seasons;
      if (updates.contexts  != null) dbUpdates.contexts  = updates.contexts;
      if (updates.notes     != null) dbUpdates.notes     = updates.notes;
      if (!Object.keys(dbUpdates).length) return { ok: false, error: "No valid fields to update" };
      const { error } = await supabase.from("garments").update(dbUpdates).eq("id", garment_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, garment_id, changes: dbUpdates };
    }
    case "exclude_garment": {
      const { garment_id, reason } = input;
      const notes = reason ? reason : "Excluded via chat";
      const { error } = await supabase.from("garments")
        .update({ exclude_from_wardrobe: true, notes }).eq("id", garment_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, garment_id, excluded: true };
    }
    case "reactivate_garment": {
      const { garment_id } = input;
      const { error } = await supabase.from("garments")
        .update({ exclude_from_wardrobe: false }).eq("id", garment_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, garment_id, reactivated: true };
    }
    case "add_strap": {
      return { ok: true, clientAction: { type: "add_strap", watchId: input.watch_id, label: input.label, color: input.color, strap_type: input.type, useCase: input.use_case ?? "" } };
    }
    case "fix_history_entry": {
      const { entry_id, action, score, context } = input;
      let patch = {};
      if (action === "mark_legacy") patch = { legacy: true };
      else if (action === "update_score" && score != null) patch = { score };
      else if (action === "update_context" && context) patch = { context };
      else return { ok: false, error: "Invalid action or missing param" };
      const { data: existing } = await supabase.from("history").select("payload").eq("id", entry_id).limit(1);
      if (!existing?.[0]) return { ok: false, error: "Entry not found" };
      const merged = { ...(existing[0].payload ?? {}), ...patch };
      const { error } = await supabase.from("history").update({ payload: merged }).eq("id", entry_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, entry_id, action, patch };
    }
    default:
      return { ok: false, error: "Unknown tool: " + toolName };
  }
}

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
      const oversized = body.conversationHistory.some(m => typeof m.content === "string" && m.content.length > 4000);
      if (oversized) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "conversationHistory message too long (max 4000 chars each)" }) };
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

    // Build context string — include IDs so Claude can reference them in tool calls
    const garmentList = (garments ?? []).map(g =>
      `[${g.id}] ${g.name} (${g.type ?? g.category}, ${g.color}, ${g.brand ?? "?"}, formality:${g.formality ?? 5}, material:${g.material ?? "?"}, weight:${g.weight ?? "?"}, seasons:${(g.seasons ?? []).join("/") || "?"}, contexts:${(g.contexts ?? []).join("/") || "?"})` 
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

    const systemPrompt = `You are Eias's personal wardrobe and watch advisor with full access to his wardrobe, watches, and wear history. You can BOTH give advice AND perform real actions on the data.

WARDROBE (${garments?.length ?? 0} garments — format: [ID] Name (type, color, brand, formality:N, material, weight, seasons, contexts)):
${garmentList}

WATCH COLLECTION (23 pieces — 13 genuine, 10 replica):
Watch IDs for add_strap tool: snowflake, rikka, pasha, laureato, reverso, santos_large, santos_octagon, blackbay, monaco, gmt, speedmaster, hanhart, laco
Genuine: GS Snowflake (silver-white), GS Rikka SBGH351 (green, bracelet broken → teal alligator default), Pasha 41 WSPA0026 (grey), GP Laureato 42mm (blue, integrated), JLC Reverso Duoface (navy), Santos Large (white/gold), Santos Octagon YG (white, vintage), Tudor BB41 (black/red), TAG Monaco (black), GMT-Master II (black), Speedmaster 3861 (black), Hanhart Pioneer (white/teal), Laco Flieger (black)
Replica: IWC Perpetual (blue), IWC Ingenieur (teal), VC Overseas (burgundy), Santos 35mm (white), Chopard Alpine Eagle (red), AP Royal Oak (green), GMT Meteorite, Day-Date (turquoise), Rolex OP (purple/grape), Breguet Tradition (black)

RECENT WEAR HISTORY (last 20):
${recentWears || "No recent data"}

STYLE DNA: ${styleDna}
MONTHLY INSIGHTS: ${monthlyReport}
TODAY'S CONTEXT: ${todayCtx}
WEATHER: ${weatherCtx}

RULES:
- Strap-shoe coordination is a GUIDELINE not a hard rule
- No loafers ever
- Shift watches only: Speedmaster, BB41, Hanhart
- Pasha excluded from shifts; Laco = casual/field only
- Replica fine for casual/flex/date night; genuine for clinic/formal
- Israel work week: Sunday = Monday equivalent, Friday = weekend start
- Layer logic: <10°C coat, <16°C sweater, <22°C light layer

ACTIONS YOU CAN TAKE:
- Fix garment tags (seasons, contexts, material, weight, formality) → use update_garment
- Rename or fix garment metadata → use update_garment
- Remove garment from wardrobe → use exclude_garment
- Bring a garment back → use reactivate_garment
- Add a strap to a watch → use add_strap
- Fix orphaned/problematic history entries → use fix_history_entry

When asked to fix/update/correct something, USE THE TOOLS. Don't just describe what you'd do — actually do it. Confirm what you did concisely.
Be specific, opinionated, and brief. Use actual garment names and IDs. Don't hedge.`;

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

    // ── First Claude call — may return tool_use blocks ─────────────────────
    const firstResult = await callClaude(apiKey, {
      model,
      max_tokens: 1000,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: "auto" },
      messages,
    }, { maxAttempts: 1 });

    const toolUseBlocks = (firstResult?.content ?? []).filter(b => b.type === "tool_use");
    const actions = [];
    const clientActions = [];

    // ── Execute tools if Claude called any ────────────────────────────────
    if (toolUseBlocks.length > 0) {
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(supabase, block.name, block.input);
          if (result.clientAction) {
            clientActions.push(result.clientAction);
          } else if (result.ok) {
            actions.push({ tool: block.name, ...result });
          }
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Second call to get the confirmation text
      const followUp = [...messages,
        { role: "assistant", content: firstResult.content },
        { role: "user",     content: toolResults },
      ];
      const secondResult = await callClaude(apiKey, {
        model,
        max_tokens: 600,
        system: systemPrompt,
        tools: TOOLS,
        messages: followUp,
      }, { maxAttempts: 1 });
      const responseText = extractText(secondResult, "Done.");
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ response: responseText, actions, clientActions }),
      };
    }

    // No tools used — plain response
    const responseText = extractText(firstResult, "I couldn't generate a response.");
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ response: responseText, actions: [], clientActions: [] }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
