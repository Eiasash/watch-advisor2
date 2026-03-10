import { callClaude } from "./_claudeClient.js";
/**
 * Netlify serverless function — AI duplicate detection.
 * Compares two garment thumbnails using Claude Vision to determine
 * if they are the same item from different angles.
 *
 * POST body: { imageA: base64, imageB: base64 }
 * Returns: { isDuplicate: boolean, confidence: "high"|"medium"|"low", reason: string }
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { imageA, imageB } = JSON.parse(event.body);

    if (!imageA || !imageB) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing image data" }),
      };
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
      };
    }

    const data = await callClaude(apiKey, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageA } },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB } },
            {
              type: "text",
              text: `Compare these two garment photos. Determine if they show the SAME physical clothing item.

SAME ITEM criteria (ALL must match):
- Same garment TYPE (both shirts, both sweaters, both pants, etc.)
- Same PRIMARY COLOR (navy=navy, not navy vs black)
- Same MATERIAL/TEXTURE (cable knit = cable knit, not cable knit vs ribbed)
- Same PATTERN (solid = solid, striped = striped, plaid = plaid)
- Same BRAND if visible on either photo

DIFFERENT ITEM even if similar:
- Same type but different color shade (navy vs black, cream vs white)
- Same type and color but different texture/pattern (cable knit vs waffle knit)
- Same type but different style (crewneck vs v-neck, half-zip vs pullover)

ANGLE SHOT (same item, different view):
- Front vs back, folded vs flat, close-up vs full, different lighting of SAME item

Return ONLY JSON:
{"isDuplicate": true/false, "isAngleShot": true/false, "confidence": "high"/"medium"/"low", "reason": "<1 sentence: what matched or differed — be specific about color, texture, pattern>"}

isDuplicate = near-identical photo (same angle, same lighting).
isAngleShot = same item from different angle/fold/lighting.
Both false = different garments.`,
            },
          ],
        },
      ],
    });

    const text = data?.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(JSON.parse(jsonMatch[0])),
      };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ isDuplicate: false, confidence: "low", reason: "Could not parse response" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
