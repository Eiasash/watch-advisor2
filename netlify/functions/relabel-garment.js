import { callClaude } from "./_claudeClient.js";
/**
 * AI relabel — Claude Vision checks a garment photo + optional extra angles.
 * Returns { confirmed, corrections: { type?, color?, color_alternatives?, material?, name?, formality? }, confidence, reason }
 */

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const { image, current, allAngles = [] } = JSON.parse(event.body ?? "{}");
    if (!image || !current) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing image or current label" }) };
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "No API key" }) };

    // Build primary image block
    async function toBlock(src) {
      if (src.startsWith("data:image/")) {
        const base64 = src.replace(/^data:image\/\w+;base64,/, "");
        const mediaType = src.startsWith("data:image/png") ? "image/png" : "image/jpeg";
        return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
      }
      if (src.startsWith("http")) {
        const imgRes = await fetch(src);
        if (!imgRes.ok) return null;
        const buf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        const ct  = imgRes.headers.get("content-type") || "image/jpeg";
        return { type: "image", source: { type: "base64", media_type: ct, data: b64 } };
      }
      return null;
    }

    const primaryBlock = await toBlock(image);
    if (!primaryBlock) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Cannot fetch image" }) };

    // Build extra angle blocks (up to 3)
    const angleBlocks = (await Promise.all(allAngles.slice(0, 3).map(toBlock))).filter(Boolean);
    const angleNote = angleBlocks.length > 0
      ? `\n${angleBlocks.length} ADDITIONAL ANGLE(S) follow — use all photos to determine true color and material.\n`
      : "";

    const VALID_COLORS = "black|white|navy|blue|grey|brown|tan|beige|cream|ecru|green|olive|teal|khaki|stone|burgundy|red|pink|orange|yellow|purple|charcoal|dark brown|light blue|dark navy|coral|multicolor|camel|rust|maroon|ivory|slate|mint|lavender|sage|wine|taupe|cognac|sand|silver|gold|denim";
    const VALID_MATERIALS = "wool|cotton|linen|denim|leather|suede|synthetic|cashmere|knit|corduroy|tweed|flannel|canvas|rubber|mesh|unknown";

    const prompt = `You are a men's fashion classifier with vision. Examine all garment photos and validate or correct the classification.
${angleNote}
CURRENT CLASSIFICATION:
- Type: ${current.type ?? "unknown"}
- Color: ${current.color ?? "unknown"}
- Name: ${current.name ?? "unknown"}
- Formality: ${current.formality ?? "??"}/10

VALID TYPES: shirt, pants, shoes, jacket, sweater, belt, accessory, bag, hat, scarf, sunglasses
VALID COLORS: ${VALID_COLORS}
VALID MATERIALS: ${VALID_MATERIALS}

TASK: Examine all angles carefully. Be precise about color (navy≠black, cream≠white, olive≠khaki). Assess material from texture, sheen, and weight cues.

Respond ONLY with valid JSON, no markdown:
{
  "confirmed": true/false,
  "confidence": 0.0-1.0,
  "reason": "1 sentence: what you see across all angles and why you confirm/correct",
  "corrections": {
    "type": "corrected type or null if correct",
    "color": "most accurate color from VALID_COLORS or null if correct",
    "color_alternatives": ["2nd most likely", "3rd most likely", "4th most likely"],
    "material": "detected material from VALID_MATERIALS",
    "name": "suggested better name (max 5 words) or null if correct",
    "formality": corrected 1-10 integer or null if correct
  }
}`;

    const contentBlocks = [primaryBlock, ...angleBlocks, { type: "text", text: prompt }];

    const data = await callClaude(apiKey, {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const text = data?.content?.[0]?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (_) {
      // Repair truncated JSON
      let repaired = cleaned;
      const ob = (repaired.match(/\{/g)||[]).length;
      const cb = (repaired.match(/\}/g)||[]).length;
      for (let i = 0; i < ob - cb; i++) repaired += "}";
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
      try { result = JSON.parse(repaired); result._repaired = true; }
      catch (__) { result = { confirmed: false, confidence: 0, reason: "AI response parse error", _repaired: true }; }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    const isClaudeError = err.message?.startsWith('Claude API error') || err.message?.startsWith('BILLING:');
    return {
      statusCode: isClaudeError ? 502 : 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
