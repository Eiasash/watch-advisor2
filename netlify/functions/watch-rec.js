/**
 * POST { outfit: {top,bottom,shoes,layers[]}, watches[], context }
 * Returns { top_pick, top_pick_why, strap_rec, runner_up, runner_up_why, avoid, color_logic }
 */
import { cacheGet, cacheSet, hashText } from "./_blobCache.js";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS" };

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:CORS };
  if (event.httpMethod !== "POST") return { statusCode:405, headers:CORS, body:JSON.stringify({ error:"Method not allowed" }) };
  try {
    const { outfit={}, watches=[], context="smart-casual" } = JSON.parse(event.body ?? "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode:500, headers:CORS, body: JSON.stringify({ error:"CLAUDE_API_KEY not set" }) };

    const ck = `watchrec:${hashText(JSON.stringify(outfit)+JSON.stringify(watches.map(w=>w.id))+context)}`;
    const hit = await cacheGet(ck);
    if (hit) return { statusCode:200, headers:{...CORS,"X-Cache":"HIT"}, body: JSON.stringify(hit) };

    const items = [];
    if (outfit.layers?.length) outfit.layers.forEach((l,i) => items.push(`Layer ${i+1}: ${l.color} ${l.pattern||"solid"} ${l.type||l.garmentType||""} ${l.name?"("+l.name+")":""}`));
    else if (outfit.top) items.push(`Top: ${outfit.top.color} ${outfit.top.pattern||"solid"} ${outfit.top.type||""} ${outfit.top.name?"("+outfit.top.name+")":""}`);
    if (outfit.bottom) items.push(`Bottom: ${outfit.bottom.color} ${outfit.bottom.pattern||"solid"} ${outfit.bottom.type||""} ${outfit.bottom.name?"("+outfit.bottom.name+")":""}`);
    if (outfit.shoes) items.push(`Shoes: ${outfit.shoes.color} ${outfit.shoes.name||outfit.shoes.type||"shoes"}`);

    const watchList = watches.map(w => ({
      id:w.id, name:`${w.brand} ${w.model}`, ref:w.ref??null, size_mm:w.size??null,
      dial:w.dial, genuine:w.genuine!==false,
      bracelet:w.bracelet??w.hasBracelet??false,
      straps:(w.straps??[]).slice(0,4).map(s=>({type:s.type,color:s.color,label:s.label})),
    }));

    const prompt = `Elite men's luxury watch advisor. Given this outfit, recommend the BEST watch from the collection.

OUTFIT:
${items.join("\n")}

CONTEXT: ${Array.isArray(context)?context.join(" + "):context}

WATCH COLLECTION:
${JSON.stringify(watchList,null,0)}

RULES:
1. STRAP-SHOE (MANDATORY): brown leather strap = brown shoes. Black strap = black shoes. Metal bracelet/rubber/NATO/integrated = neutral.
2. DIAL HARMONY: Blue/navy→grey,white,navy,cream. Green→brown,tan,olive,cream. Black→neutral. Teal→grey,navy,white. White/silver→universal. Burgundy→navy,grey,cream. Purple→grey,navy,charcoal. Meteorite→grey,charcoal,navy.
3. COLOR TEMPERATURE: Warm dials (gold,champagne) pair with warm outfit tones. Cool dials with cool tones.
4. STRAP AS BRIDGE: strap color ties watch to outfit palette.
5. FORMALITY: dress watch for formal/clinic, sport for casual.
6. Genuine pieces preferred for clinic/formal context.

Return ONLY valid JSON, no markdown:
{"top_pick":"exact watch brand + model","top_pick_why":"2-3 sentences on color/formality/strap logic","strap_rec":"which strap and why (1 sentence), or null if bracelet-only","runner_up":"second best watch name","runner_up_why":"1 sentence on why it's the alternative","avoid":"watch to avoid and why (1 sentence) or null","color_logic":"how dial+strap interact with outfit palette (1-2 sentences)"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:700,
        messages:[{role:"user",content:prompt}] }),
    });
    if (!res.ok) { const err = await res.text(); return { statusCode:502, headers:CORS, body:JSON.stringify({ error:`Claude API error: ${res.status}`, detail:err }) }; }
    const data = await res.json();
    const parsed = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,"").trim() ?? "{}");
    cacheSet(ck, parsed);
    return { statusCode:200, headers:{...CORS,"X-Cache":"MISS"}, body:JSON.stringify(parsed) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({ error:e.message }) };
  }
}
