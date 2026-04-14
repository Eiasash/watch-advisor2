/**
 * POST { occasion, garments[], watches[] }
 * Returns { occasion_tips, outfits[{name,top,bottom,shoes,watch,layers,why,confidence}], avoid, power_move }
 */
import { cacheGet, cacheSet, hashText } from "./_blobCache.js";
import { callClaude, extractText } from "./_claudeClient.js";
import { cors } from "./_cors.js";

export async function handler(event) {
  const CORS = cors(event);
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:CORS };
  if (event.httpMethod !== "POST") return { statusCode:405, headers:CORS, body:JSON.stringify({ error:"Method not allowed" }) };
  try {
    const { occasion="", garments=[], watches=[] } = JSON.parse(event.body ?? "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode:500, headers:CORS, body:JSON.stringify({ error:"CLAUDE_API_KEY not set" }) };
    if (!occasion.trim()) return { statusCode:400, headers:CORS, body:JSON.stringify({ error:"occasion required" }) };

    const ck = `occasion:${hashText(occasion.toLowerCase().trim()+garments.length+watches.length)}`;
    const hit = await cacheGet(ck);
    if (hit) return { statusCode:200, headers:{...CORS,"X-Cache":"HIT"}, body:JSON.stringify(hit) };

    const ACCESSORY_EXCL = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);
    const items = garments.filter(g=>g.color&&!g.needsReview&&!ACCESSORY_EXCL.has(g.type||g.garmentType)).map(g=>({
      type:g.type||g.garmentType, name:g.name||g.color, color:g.color, pattern:g.pattern||"solid", material:g.material||""
    }));
    const watchList = watches.map(w=>({
      name:`${w.brand} ${w.model}`, ref:w.ref??null, size_mm:w.size??null, genuine:w.genuine!==false,
      dial:w.dial, bracelet:w.bracelet??false,
      straps:(w.straps??[]).slice(0,3).map(s=>({type:s.type,color:s.color})),
    }));

    const prompt = `Luxury men's style advisor. Client needs outfit recommendations for a specific occasion.

OCCASION: ${occasion}

WARDROBE (${items.length} items):
${JSON.stringify(items.slice(0,35))}

WATCHES:
${JSON.stringify(watchList)}

RULES:
- STRAP-SHOE: NOT a rule — do not enforce strap-shoe color matching.
- Genuine watches for formal/clinic/credibility contexts. Replicas acceptable for casual/date/riviera.
- Build outfits from actual wardrobe items listed above only.

Create 2 complete outfit recommendations. Return ONLY valid JSON, no markdown:
{"occasion_tips":"3-4 sentences of advice — dress code nuances, common mistakes, power moves","outfits":[{"name":"creative editorial outfit name","top":"exact color + item name","bottom":"exact color + item name","shoes":"color and type","watch":"exact brand + model name","layers":"outer/mid layer if relevant or null","why":"2 sentences on color story and why it works","confidence":1-10},{"name":"...","top":"...","bottom":"...","shoes":"...","watch":"...","layers":"...","why":"...","confidence":1-10}],"avoid":"2 sentences on what to avoid with specific examples","power_move":"one unexpected styling choice that would make a statement (1 sentence)"}`;

    const res = await callClaude(apiKey, { model:"claude-sonnet-4-6", max_tokens:1000,
        messages:[{role:"user",content:prompt}] });
    const raw = extractText(res, "");
    let parsed;
    try {
      // Strip markdown fences if present, then parse
      parsed = JSON.parse(raw.replace(/^```json\s*/,"").replace(/\s*```$/,"").trim());
    } catch {
      // Fallback: find the first { ... } block in the response
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Claude returned non-JSON response");
      parsed = JSON.parse(m[0]);
    }
    cacheSet(ck, parsed);
    return { statusCode:200, headers:{...CORS,"X-Cache":"MISS"}, body:JSON.stringify(parsed) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({ error:e.message }) };
  }
}
