/**
 * Netlify function — AI Selfie / Outfit Photo Checker (aiSelfieCheck)
 * Claude Vision analyzes a full outfit photo: garments, watch detection,
 * strap-shoe rule, color harmony, fit, proportion, upgrade suggestions.
 *
 * POST body: { image (base64 data URL or https:// URL), watches, context, confirmedWatchId? }
 * Returns: { impact, impact_why, vision, color_story, proportion_note,
 *            fit_assessment, works, risk, upgrade, strap_call,
 *            better_watch, watch_confidence, watch_details, items_detected[] }
 */
import { cacheGet, cacheSet, hashText } from "./_blobCache.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    const { image, watches = [], context = "smart-casual", confirmedWatchId } = JSON.parse(event.body ?? "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };
    if (!image) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "image required" }) };

    // Cache by image hash + context (selfie results are context-dependent)
    const cacheKey = `selfie:${hashText(image.slice(-200) + context)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return { statusCode: 200, headers: { ...CORS, "X-Cache": "HIT" }, body: JSON.stringify({ ...cached, _cached: true }) };

    // Build image block
    let imageBlock;
    if (image.startsWith("data:image/")) {
      const b64 = image.replace(/^data:image\/\w+;base64,/, "");
      const mt  = image.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: mt, data: b64 } };
    } else {
      const r = await fetch(image);
      const buf = await r.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      imageBlock = { type: "image", source: { type: "base64", media_type: r.headers.get("content-type") || "image/jpeg", data: b64 } };
    }

    const watchList = watches.map(w => ({
      id: w.id, name: `${w.brand} ${w.model}`, ref: w.ref ?? null,
      size_mm: w.size ?? null, dial: w.dial, bracelet: w.bracelet ?? w.hasBracelet ?? false,
      straps: (w.straps ?? []).slice(0, 3).map(s => ({ type: s.type, color: s.color })),
      genuine: w.genuine !== false,
    }));

    const confirmed = confirmedWatchId ? watches.find(w => w.id === confirmedWatchId) : null;
    const confirmedLine = confirmed ? `CONFIRMED WATCH: ${confirmed.brand} ${confirmed.model}${confirmed.ref ? ` (Ref ${confirmed.ref})` : ""}\n` : "";

    const prompt = `Elite men's luxury style advisor. Analyze this outfit photo completely.

WATCH COLLECTION (${watchList.length} pieces):
${JSON.stringify(watchList, null, 0)}
${confirmedLine}
CONTEXT: ${Array.isArray(context) ? context.join(" + ") : context}

COLOR PAIRING RULES:
• STRAP-SHOE (MANDATORY): brown leather strap = brown shoes. Black strap = black shoes. Metal bracelet/rubber/NATO = neutral (no rule).
• DIAL-OUTFIT: Blue→grey/white/navy/cream. Green→brown/tan/olive/cream. Black→neutral. Teal→grey/navy/white. White/silver→universal. Burgundy→navy/grey/cream. Purple→grey/navy/charcoal.
• TEMPERATURE: Warm dials (gold/champagne) pair with warm outfit tones. Cool dials with cool tones.
• STRAP AS BRIDGE: strap color connects watch to outfit palette.

Analyze: 1) Every garment — precise color (navy≠black, cream≠white, olive≠khaki), material, fit. 2) WATCH: match wrist watch against collection by case shape, dial color, bracelet/strap. 3) Color harmony across every element. 4) Strap-shoe rule strictly. 5) Proportion and silhouette.

Return ONLY valid JSON, no markdown:
{
  "impact": 1-10,
  "impact_why": "1 sentence",
  "vision": "3-4 sentence cinematic description of the full look",
  "color_story": "palette analysis — warm/cool balance, accent echoes, mismatches",
  "proportion_note": "sleeve length, trouser break, shoulder fit, silhouette (1-2 sentences)",
  "fit_assessment": "fit quality summary (1 sentence)",
  "works": "strongest elements (1-2 sentences)",
  "risk": "clashes or tensions, or null if none",
  "upgrade": "single most impactful change (1 sentence)",
  "strap_call": "strap recommendation referencing actual straps, or null",
  "better_watch": "alternative watch name from collection or null",
  "watch_confidence": 1-10,
  "watch_details": "what watch was seen on the wrist (1 sentence)",
  "items_detected": [{"type":"Top|Bottom|Shoes|Watch|Accessory","color":"","description":""}]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: [imageBlock, { type: "text", text: prompt }] }],
      }),
    });

    const data  = await res.json();
    const raw   = data.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    cacheSet(cacheKey, parsed);
    return { statusCode: 200, headers: { ...CORS, "X-Cache": "MISS" }, body: JSON.stringify(parsed) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
}
