import { callClaude } from "./_claudeClient.js";
/**
 * Netlify serverless function — Claude Vision garment classifier.
 * Returns type, primary color, material, formality, AND color_alternatives (top 3).
 *
 * Environment variable required: CLAUDE_API_KEY
 */

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const { image } = JSON.parse(event.body ?? "{}");
    if (!image) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image data" }) };

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }) };

    const response = await callClaude(apiKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 350,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: image },
            },
            {
              type: "text",
              text: `Identify this clothing item precisely. Return ONLY valid JSON:
{
  "type": "shirt"|"pants"|"shoes"|"jacket"|"sweater"|"belt"|"hat"|"scarf"|"bag"|"accessory",
  "color": <most accurate primary color — one of: beige|black|blue|brown|burgundy|camel|charcoal|cognac|coral|cream|dark brown|dark green|dark navy|denim|ecru|gold|green|grey|ivory|khaki|lavender|light blue|maroon|mint|multicolor|navy|olive|orange|pink|purple|red|rust|sage|sand|silver|slate|stone|tan|taupe|teal|white|wine|yellow>,
  "color_alternatives": [<2nd most likely color>, <3rd most likely color>, <4th most likely color>],
  "material": "wool"|"cotton"|"linen"|"denim"|"leather"|"suede"|"synthetic"|"cashmere"|"knit"|"corduroy"|"tweed"|"flannel"|"canvas"|"rubber"|"mesh"|"unknown",
  "pattern": "solid"|"striped"|"plaid"|"checked"|"cable knit"|"ribbed"|"textured"|"printed"|"houndstooth"|"herringbone",
  "formality": <1-10 integer>,
  "confidence": <0.0-1.0>
}
Be precise about color — navy is not black, cream is not white, olive is not khaki. color_alternatives must use the same color vocabulary. material should reflect what the fabric visually appears to be.`,
            },
          ],
        },
      ],
    });

    const raw = response?.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = {}; }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
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
