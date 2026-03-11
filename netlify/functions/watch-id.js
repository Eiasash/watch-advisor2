/**
 * POST { image (base64 data URL or https:// URL), collection?: [{brand,model,ref,dial}] }
 * Returns { brand, model, reference, dial_color, dial_hex, case_material, case_size,
 *           movement_type, lug_width, has_bracelet, bracelet_type, strap_type, strap_color,
 *           complications[], style_category, suggested_contexts[], confidence, emoji, notes }
 */
import { cacheGet, cacheSet, hashText } from "./_blobCache.js";
import { callClaude } from "./_claudeClient.js";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json" };

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:CORS };
  if (event.httpMethod !== "POST") return { statusCode:405, headers:CORS, body:JSON.stringify({ error:"Method not allowed" }) };
  try {
    const { image, collection } = JSON.parse(event.body ?? "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode:500, headers:CORS, body:JSON.stringify({ error:"CLAUDE_API_KEY not set" }) };
    if (!image) return { statusCode:400, headers:CORS, body:JSON.stringify({ error:"image required" }) };

    // Cache key: sample beginning + middle of base64 + length
    // BUG FIX: image.slice(-300) was wrong — trailing base64 chars are often identical
    // padding across different images, causing cache collisions where one watch's result
    // was returned for a completely different watch photo.
    const imgLen  = image.length;
    const ckInput = image.slice(30, 330) + "|" + image.slice(Math.floor(imgLen / 2), Math.floor(imgLen / 2) + 200) + "|" + imgLen;
    const ck = `watchid2:${hashText(ckInput)}`;
    const hit = await cacheGet(ck);
    if (hit) return { statusCode:200, headers:{...CORS,"X-Cache":"HIT"}, body:JSON.stringify(hit) };

    let imageBlock;
    if (image.startsWith("data:image/")) {
      const b64 = image.replace(/^data:image\/\w+;base64,/, "");
      const mt  = image.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      imageBlock = { type:"image", source:{ type:"base64", media_type:mt, data:b64 } };
    } else {
      const r = await fetch(image);
      const buf = await r.arrayBuffer();
      imageBlock = { type:"image", source:{ type:"base64", media_type:r.headers.get("content-type")||"image/jpeg", data:Buffer.from(buf).toString("base64") } };
    }

    // Build collection context — lets Claude match against known pieces before guessing
    const knownWatches = Array.isArray(collection) && collection.length
      ? "\n\nKNOWN WATCHES IN THIS COLLECTION (match against these FIRST before guessing):\n" +
        collection.map(w => `- ${w.brand} ${w.model}${w.ref ? ` (Ref: ${w.ref})` : ""} — ${w.dial ?? "unknown"} dial`).join("\n")
      : "";

    const prompt = `Expert watch identifier for a luxury watch collection app. Analyze this photo with maximum precision.
${knownWatches}

CRITICAL RULES:
1. If the photo shows a watch matching one in the known collection above, prioritise that identification strongly.
2. Look for brand name/logo engraved on dial or caseback before guessing.
3. Examine case shape, bracelet integration, crown position, bezel style, and dial texture.

COMMON MISIDENTIFICATION TRAPS — read carefully:
- GP Laureato vs Patek Nautilus: both are octagonal-case integrated-bracelet steel sports watches with blue dials, but GP Laureato has "GIRARD-PERREGAUX" text on the dial, GP monogram on crown, and a softer cushion-octagon case. Nautilus has "PATEK PHILIPPE GENEVE" on dial and a more angular octagon.
- AP Royal Oak vs Nautilus: Royal Oak has 8 exposed hexagonal screws on bezel, AP crown at 3 o'clock.
- Cartier Santos vs AP Royal Oak: Santos has square case, exposed screws on the lugs only.
- IWC Ingenieur vs Omega Aqua Terra: IWC has a stepped inner bezel.

Return ONLY valid JSON, no markdown:
{"brand":"Full brand name","model":"Model name","reference":"Reference number if identifiable or null","dial_color":"Primary dial color (Silver-White/Blue/Black/Teal/Burgundy/Green/White/Meteorite/Turquoise/Ivory/Purple/Grey)","dial_hex":"Hex color for dial","case_material":"steel/titanium/gold/rose-gold/two-tone","case_size":"Estimated mm or null","movement_type":"automatic/manual/quartz/spring-drive","lug_width":"Estimated mm (common: 18,19,20,21,22) or null","has_bracelet":true/false,"bracelet_type":"jubilee/oyster/integrated/sport/president or null","strap_type":"bracelet/leather/rubber/nato/canvas or null","strap_color":"strap color or null","complications":["chronograph","GMT","moon-phase","perpetual-calendar","date","flyback"],"style_category":"dress/sport/diver/pilot/chronograph/field/integrated","suggested_contexts":["formal","clinic","smart-casual","casual","date","weekend","riviera"],"temperature":"warm/cool/neutral/mixed","confidence":1-10,"emoji":"single emoji","notes":"Key visual cues used for identification — brand text seen on dial, case shape, bezel features (1 sentence)"}`;

    const res = await callClaude(apiKey, { model:"claude-sonnet-4-6", max_tokens:900,
        messages:[{role:"user",content:[imageBlock,{type:"text",text:prompt}]}] });
    const raw = res.content?.[0]?.text?.replace(/```json|```/g,"").trim() ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // Attempt repair on truncated JSON
      let repaired = raw;
      const opens = (repaired.match(/\[/g)||[]).length;
      const closes = (repaired.match(/\]/g)||[]).length;
      for (let i = 0; i < opens - closes; i++) repaired += "]";
      const ob = (repaired.match(/\{/g)||[]).length;
      const cb = (repaired.match(/\}/g)||[]).length;
      for (let i = 0; i < ob - cb; i++) repaired += "}";
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
      try { parsed = JSON.parse(repaired); parsed._repaired = true; }
      catch (__) { parsed = { brand: null, model: null, confidence: 0, notes: "JSON parse failed", _repaired: true }; }
    }
    cacheSet(ck, parsed);
    return { statusCode:200, headers:{...CORS,"X-Cache":"MISS"}, body:JSON.stringify(parsed) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({ error:e.message }) };
  }
}
