/**
 * Netlify function — bulk garment tagger.
 * Takes up to 10 garments (name + type + color + material) and returns
 * { id, seasons, contexts, material, pattern } for each.
 *
 * POST body: { garments: [{ id, name, type, color, material }] }
 * Returns:   { results: [{ id, seasons, contexts, material, pattern }] }
 */
import { callClaude }    from "./_claudeClient.js";
import { cacheGet, cacheSet } from "./_blobCache.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEASONS  = ["spring","summer","autumn","winter","all-season"];
const CONTEXTS = ["clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge"];

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { garments = [] } = JSON.parse(event.body ?? "{}");
    if (!garments.length)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "No garments" }) };

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };

    const batch = garments.slice(0, 10);

    // Cache key: sorted IDs + names so reordering doesn't miss cache
    const ck = `bulktag:${batch.map(g => g.id).sort().join(",")}`;
    const cached = await cacheGet(ck);
    if (cached) return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" }, body: JSON.stringify(cached) };

    const itemList = batch.map((g, i) =>
      `${i + 1}. id="${g.id}" name="${g.name}" type="${g.type ?? "unknown"}" color="${g.color ?? "unknown"}" material="${g.material ?? "unknown"}"`
    ).join("\n");

    const prompt = `You are a fashion AI. For each garment below, return season suitability, wear contexts, material (if unknown), and pattern.

GARMENTS:
${itemList}

Return ONLY a JSON array — one object per garment, same order, no markdown:
[
  {
    "id": "<same id>",
    "seasons": [<subset of: "spring","summer","autumn","winter","all-season">],
    "contexts": [<subset of: "clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge">],
    "material": "<best guess: wool|cotton|linen|denim|leather|suede|synthetic|cashmere|knit|corduroy|tweed|flannel|canvas|rubber|unknown>",
    "pattern": "<solid|striped|plaid|checked|cable knit|ribbed|textured|printed|houndstooth|herringbone>"
  }
]

Rules:
- seasons: be specific — a heavy wool sweater is NOT summer. A linen shirt is NOT winter.
- "all-season" only for genuinely year-round pieces (e.g. a classic white Oxford shirt).
- contexts: clinic = professional medical setting. smart-casual = business casual. riviera = resort/yacht.
- A formal white dress shirt gets ["clinic","formal","smart-casual"]; joggers get ["casual","lounge"].
- Material: if already provided and looks correct, keep it. Refine if obviously wrong.
- Every garment must have at least 1 season and 1 context.`;

    const res = await callClaude(apiKey, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = res?.content?.[0]?.text ?? "[]";
    const clean = raw.replace(/```json|```/g, "").trim();
    let results;
    try { results = JSON.parse(clean); } catch { results = []; }

    // Validate each result
    const validated = (Array.isArray(results) ? results : []).map(r => ({
      id:       r.id,
      seasons:  (r.seasons  ?? []).filter(s => SEASONS.includes(s)),
      contexts: (r.contexts ?? []).filter(c => CONTEXTS.includes(c)),
      material: r.material ?? null,
      pattern:  r.pattern  ?? null,
    })).filter(r => r.id && r.seasons.length && r.contexts.length);

    const payload = { results: validated };
    if (validated.length === batch.length) cacheSet(ck, payload); // only cache complete results
    return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" }, body: JSON.stringify(payload) };

  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
