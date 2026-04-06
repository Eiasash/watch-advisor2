/**
 * Netlify function — bulk garment tagger.
 * Takes up to 10 garments (name + type + color + material) and returns
 * { id, seasons, contexts, material, pattern } for each.
 *
 * POST body: { garments: [{ id, name, type, color, material }] }
 * Returns:   { results: [{ id, seasons, contexts, material, pattern }] }
 */
import { callClaude, extractText } from "./_claudeClient.js";
import { cacheGet, cacheSet } from "./_blobCache.js";
import { cors } from "./_cors.js";

const CORS = cors(event);

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
      `${i + 1}. id="${g.id}" name="${g.name}" type="${g.type ?? "unknown"}" color="${g.color ?? "unknown"}" material="${g.material ?? "unknown"}" formality=${g.formality ?? "unknown"} subtype="${g.subtype ?? "unknown"}"`
    ).join("\n");

    const prompt = `You are an expert menswear AI. For each garment below, return enriched metadata.

GARMENTS:
${itemList}

Return ONLY a JSON array — one object per garment, same order, no markdown:
[
  {
    "id": "<same id>",
    "seasons": [<subset of: "spring","summer","autumn","winter","all-season">],
    "contexts": [<subset of: "clinic","formal","smart-casual","casual","date-night","riviera","sport","lounge">],
    "material": "<wool|cotton|linen|denim|leather|suede|synthetic|cashmere|knit|corduroy|tweed|flannel|canvas|rubber|jersey|silk|nylon|chambray|seersucker|unknown>",
    "pattern": "<solid|striped|plaid|checked|cable knit|ribbed|textured|printed|houndstooth|herringbone|paisley|geometric|floral|color block|windowpane|micro-check>",
    "formality": <1-10 integer — refined based on garment details>,
    "weight": "ultralight"|"light"|"medium"|"heavy",
    "fit": "slim"|"regular"|"relaxed"|"oversized"|null
  }
]

SEASON RULES — be specific:
- Heavy wool/tweed/chunky knit → autumn/winter ONLY
- Linen/seersucker/lightweight cotton → spring/summer ONLY
- Medium-weight cotton chinos, oxford shirts, leather derbies → all-season
- "all-season" only for genuinely year-round pieces
- Layering pieces (cardigans, lightweight knits) → spring/autumn (transitional)

CONTEXT RULES:
- clinic = professional medical setting (neat, polished — polos/oxfords/chinos/derbies, NOT jeans/sneakers)
- formal = suit/tie events (dress shirts, dress trousers, oxford shoes)
- smart-casual = office/dinner no tie (knits, chinos, blazers, derbies/loafers)
- casual = weekend/errand (jeans, tees, sneakers, hoodies)
- date-night = dinner/drinks (well-cut knits, dark denim, smart boots)
- riviera = resort/beach/yacht (linen, light colors, espadrilles, camp collar shirts)
- sport = athletic/gym wear (joggers, sneakers, performance fabrics)
- lounge = home/sleepwear (sweatpants, hoodies, slippers)

FORMALITY RULES — refine based on details:
- 1-2: gym/lounge (joggers, hoodies, slides)
- 3-4: casual (jeans, tees, sneakers, baseball caps)
- 5-6: smart-casual (chinos, polos, knit sweaters, clean sneakers)
- 7-8: business (oxford shirts, dress trousers, blazers, derbies/loafers)
- 9-10: formal (dress shirts, suits, oxford shoes, ties)

WEIGHT: ultralight=linen/silk, light=cotton tee/poplin, medium=oxford/chinos/standard knit, heavy=overcoat/chunky knit/thick denim
FIT: slim=fitted/tapered, regular=standard, relaxed=loose, oversized=boxy, null=shoes/accessories

- Material: if already provided and correct, keep it. Refine if wrong.
- Every garment must have at least 1 season and 1 context.`;

    const res = await callClaude(apiKey, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = extractText(res, "[]");
    const clean = raw.replace(/```json|```/g, "").trim();
    let results;
    try { results = JSON.parse(clean); } catch { results = []; }

    // Validate each result
    const WEIGHTS = ["ultralight","light","medium","heavy"];
    const FITS = ["slim","regular","relaxed","oversized"];
    const validated = (Array.isArray(results) ? results : []).map(r => ({
      id:        r.id,
      seasons:   (Array.isArray(r.seasons) ? r.seasons : []).filter(s => SEASONS.includes(s)),
      contexts:  (Array.isArray(r.contexts) ? r.contexts : []).filter(c => CONTEXTS.includes(c)),
      material:  r.material ?? null,
      pattern:   r.pattern  ?? null,
      formality: typeof r.formality === "number" && r.formality >= 1 && r.formality <= 10 ? r.formality : null,
      weight:    WEIGHTS.includes(r.weight) ? r.weight : null,
      fit:       FITS.includes(r.fit) ? r.fit : null,
    })).filter(r => r.id && r.seasons.length && r.contexts.length);

    const payload = { results: validated };
    if (validated.length === batch.length) cacheSet(ck, payload); // only cache complete results
    return { statusCode: 200, headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" }, body: JSON.stringify(payload) };

  } catch (err) {
    const isBilling = err.message?.startsWith("BILLING:");
    return { statusCode: isBilling ? 402 : 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
}
