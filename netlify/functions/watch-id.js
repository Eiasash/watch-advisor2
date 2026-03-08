/**
 * POST { image (base64 data URL or https:// URL) }
 * Returns { brand, model, reference, dial_color, dial_hex, case_material, case_size,
 *           movement_type, lug_width, has_bracelet, strap_type, strap_color,
 *           complications[], style_category, suggested_contexts[], confidence, emoji, notes }
 */
import { cacheGet, cacheSet, hashText } from "./_blobCache.js";
import { callClaude } from "./_claudeClient.js";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS" };

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:CORS };
  if (event.httpMethod !== "POST") return { statusCode:405, headers:CORS, body:JSON.stringify({ error:"Method not allowed" }) };
  try {
    const { image } = JSON.parse(event.body ?? "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode:500, headers:CORS, body:JSON.stringify({ error:"CLAUDE_API_KEY not set" }) };
    if (!image) return { statusCode:400, headers:CORS, body:JSON.stringify({ error:"image required" }) };

    const ck = `watchid:${hashText(image.slice(-300))}`;
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

    const prompt = `Expert watch identifier for a luxury watch collection app. Analyze this watch photo precisely.

Return ONLY valid JSON, no markdown:
{"brand":"Full brand name","model":"Model name","reference":"Reference number if identifiable or null","dial_color":"Primary dial color (Silver-White/Blue/Black/Teal/Burgundy/Green/White/Meteorite/Turquoise/Ivory/Purple/Grey)","dial_hex":"Hex color for dial","case_material":"steel/titanium/gold/rose-gold/two-tone","case_size":"Estimated mm or null","movement_type":"automatic/manual/quartz/spring-drive","lug_width":"Estimated mm (common: 18,19,20,21,22) or null","has_bracelet":true/false,"bracelet_type":"jubilee/oyster/integrated/sport/president or null","strap_type":"bracelet/leather/rubber/nato/canvas or null","strap_color":"strap color or null","complications":["chronograph","GMT","moon-phase","perpetual-calendar","date","flyback"],"style_category":"dress/sport/diver/pilot/chronograph/field/integrated","suggested_contexts":["formal","clinic","smart-casual","casual","date","weekend","riviera"],"temperature":"warm/cool/neutral/mixed","confidence":1-10,"emoji":"single emoji","notes":"Additional identification notes (1 sentence)"}`;

    const res = await callClaude(apiKey, { model:"claude-sonnet-4-20250514", max_tokens:700,
        messages:[{role:"user",content:[imageBlock,{type:"text",text:prompt}]}] });
    const data = res;
    const parsed = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,"").trim() ?? "{}");
    cacheSet(ck, parsed);
    return { statusCode:200, headers:{...CORS,"X-Cache":"MISS"}, body:JSON.stringify(parsed) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({ error:e.message }) };
  }
}
