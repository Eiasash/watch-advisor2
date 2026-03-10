/**
 * extract-outfit — Netlify function
 * Takes a selfie/outfit photo + user's wardrobe, returns garment matches.
 * Called from SelfiePanel "👕 Use as Today's Outfit" button.
 */
import { callClaude } from "./_claudeClient.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
  }

  let image, garments;
  try {
    ({ image, garments } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!image) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image" }) };
  }

  // Strip data URL prefix if present
  const base64 = image.includes(",") ? image.split(",")[1] : image;

  // Build garment list with names for Claude to match against directly
  const garmentList = (garments ?? [])
    .filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo")
    .map(g => `  [${g.id}] ${g.name ?? "?"} — ${g.color ?? "?"} ${g.type ?? "?"} (formality ${g.formality ?? 5})`)
    .join("\n");

  const prompt = `You are analyzing an outfit photo to identify which SPECIFIC garments from the user's wardrobe are being worn.

USER'S WARDROBE (match against these EXACT items):
${garmentList}

TASK:
1. Examine the photo carefully — identify every visible garment by type and color.
2. For each visible garment, find the BEST match from the wardrobe list above.
3. Match by: color match (most important), type match, and name clues (e.g. "cable knit" texture, "oxford" collar style).
4. Only return matches with reasonable confidence. Skip items you can't identify.

COLOR PRECISION:
- navy ≠ black, cream ≠ white, olive ≠ khaki, charcoal ≠ black
- Look at the actual color in the photo, not assumptions

Return ONLY a JSON array, no markdown:
[
  { "garmentId": "<exact ID from wardrobe list>", "confidence": <1-10>, "reason": "<what you see that matches>" },
  ...
]

Focus on: outermost top layer, mid-layer (sweater/knit), base shirt, pants, shoes, belt. Skip accessories.`;

  try {
    const resp = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: prompt },
        ],
      }],
    });

    const raw = resp?.content?.[0]?.text ?? "[]";
    let detected;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      detected = JSON.parse(clean);
    } catch {
      detected = [];
    }

    // Claude returns garmentId directly — validate they exist in the wardrobe
    const validIds = new Set((garments ?? []).map(g => g.id));
    const matches = (Array.isArray(detected) ? detected : [])
      .filter(d => d.garmentId && validIds.has(d.garmentId) && (d.confidence ?? 0) >= 4)
      .map(d => ({ garmentId: d.garmentId, confidence: d.confidence, reason: d.reason }));

    // Deduplicate — keep highest confidence per garmentId
    const deduped = [];
    const seen = new Set();
    for (const m of matches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      if (!seen.has(m.garmentId)) {
        seen.add(m.garmentId);
        deduped.push(m);
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ matches: deduped, detected }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
