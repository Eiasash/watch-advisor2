import { callClaude } from "./_claudeClient.js";
import { cacheGet, cacheSet } from "./_blobCache.js";

/**
 * Netlify serverless function — Claude Vision garment classifier.
 * Returns type, primary color, material, formality, AND color_alternatives (top 3).
 *
 * POST body: { image: base64string, hash?: string }
 * Cache: keyed by image hash — same photo never re-classified.
 */

const VALID_TYPES = ["shirt","pants","shoes","jacket","sweater","belt","sunglasses","hat",
                     "scarf","bag","accessory","watch","outfit-photo","outfit-shot"];

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const { image, hash } = JSON.parse(event.body ?? "{}");
    if (!image) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image data" }) };

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };

    // ── Cache check ──────────────────────────────────────────────────────────
    const cacheKey = hash ? `classify:${hash}` : null;
    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" },
          body: JSON.stringify({ ...cached, _cached: true }),
        };
      }
    }

    // ── Detect media type from data URL prefix ────────────────────────────────
    const rawB64 = image.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = image.startsWith("data:image/png") ? "image/png"
                    : image.startsWith("data:image/webp") ? "image/webp"
                    : "image/jpeg";

    const response = await callClaude(apiKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 350,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: rawB64 },
            },
            {
              type: "text",
              text: `Identify this clothing item precisely. Return ONLY valid JSON with no markdown:
{
  "type": one of: ${VALID_TYPES.join("|")},
  "color": <most accurate primary color — one of: beige|black|blue|brown|burgundy|camel|charcoal|cognac|coral|cream|dark brown|dark green|dark navy|denim|ecru|gold|green|grey|ivory|khaki|lavender|light blue|maroon|mint|multicolor|navy|olive|orange|pink|purple|red|rust|sage|sand|silver|slate|stone|tan|taupe|teal|white|wine|yellow>,
  "color_alternatives": [<2nd most likely color>, <3rd most likely color>, <4th most likely color>],
  "material": "wool"|"cotton"|"linen"|"denim"|"leather"|"suede"|"synthetic"|"cashmere"|"knit"|"corduroy"|"tweed"|"flannel"|"canvas"|"rubber"|"mesh"|"unknown",
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone",
  "formality": <1-10 integer>,
  "confidence": <0.0-1.0>
}
Rules: navy≠black, cream≠white, olive≠khaki. color_alternatives must use the same color vocabulary. material should reflect what the fabric visually appears to be.`,
            },
          ],
        },
      ],
    });

    const raw = response?.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = {}; }

    // Validate type — reject hallucinations
    if (parsed.type && !VALID_TYPES.includes(parsed.type)) parsed.type = "accessory";

    // ── Cache write ──────────────────────────────────────────────────────────
    if (cacheKey && parsed.type) {
      cacheSet(cacheKey, parsed); // fire-and-forget
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
