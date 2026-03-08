/**
 * extract-outfit — Netlify function
 * Takes a selfie/outfit photo + user's wardrobe, returns garment matches.
 * Called from SelfiePanel "👕 Use as Today's Outfit" button.
 */
import { callClaude } from "./_claudeClient.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };
  }

  let image, garments;
  try {
    ({ image, garments } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing image" }) };
  }

  // Strip data URL prefix if present
  const base64 = image.includes(",") ? image.split(",")[1] : image;

  // Build colour + type vocabulary from the user's actual wardrobe
  const colorVocab  = [...new Set((garments ?? []).map(g => g.color).filter(Boolean))];
  const typeVocab   = [...new Set((garments ?? []).map(g => g.type).filter(Boolean))];

  const prompt = `You are analyzing an outfit photo to identify the visible garments.

The user's wardrobe uses these EXACT type values: ${typeVocab.length ? typeVocab.join(", ") : "shirt, pants, shoes, jacket, sweater, coat"}
The user's wardrobe uses these EXACT color values: ${colorVocab.length ? colorVocab.join(", ") : "navy, grey, black, white, brown, olive, khaki, beige, cream, teal, burgundy, green, blue"}

For each clearly visible garment in the photo, return one JSON object.
CRITICAL: type and color MUST be chosen from the vocabulary lists above — pick the closest match.
If a garment is not clearly visible, omit it.

Return ONLY a JSON array, no markdown, no explanation:
[
  { "type": "<exact type from vocab>", "color": "<exact color from vocab>", "confidence": <1-10> },
  ...
]

Focus on: top layer (shirt/sweater/jacket), bottom (pants), shoes. Omit accessories.`;

  try {
    const resp = await callClaude(apiKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
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

    // Match each detected item to the best wardrobe garment
    const matches = [];
    const used = new Set();

    for (const det of detected) {
      if (!Array.isArray(garments) || !garments.length) break;
      if (det.confidence < 4) continue; // skip low-confidence detections

      const pool = garments.filter(g => !used.has(g.id) && !g.excludeFromWardrobe);
      if (!pool.length) break;

      // Score: exact type match (5pts), exact color match (4pts), partial color match (2pts)
      const scored = pool.map(g => {
        let s = 0;
        const gType  = (g.type  ?? "").toLowerCase();
        const gColor = (g.color ?? "").toLowerCase();
        const dType  = (det.type  ?? "").toLowerCase();
        const dColor = (det.color ?? "").toLowerCase();
        if (gType === dType)  s += 5;
        if (gColor === dColor) s += 4;
        else if (gColor.includes(dColor) || dColor.includes(gColor)) s += 2;
        return { g, s };
      }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);

      if (scored.length) {
        used.add(scored[0].g.id);
        matches.push({ garmentId: scored[0].g.id, detected: det, score: scored[0].s });
      }
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ matches, detected }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
