/**
 * AI relabel — Claude Vision checks a garment photo against its current label.
 * Returns { confirmed: bool, corrections: { type?, color?, name?, notes? }, confidence, reason }
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" } };
  }

  try {
    const { image, current } = JSON.parse(event.body ?? "{}");
    if (!image || !current) {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Missing image or current label" }) };
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "No API key" }) };

    // Build image block — handle both base64 data URLs and HTTPS Storage URLs
    let imageBlock;
    if (image.startsWith("data:image/")) {
      const base64 = image.replace(/^data:image\/\w+;base64,/, "");
      const mediaType = image.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
    } else if (image.startsWith("http")) {
      const imgRes = await fetch(image);
      if (!imgRes.ok) return { statusCode: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Could not fetch image" }) };
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct  = imgRes.headers.get("content-type") || "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: ct, data: b64 } };
    } else {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "image must be a data URL or https:// URL" }) };
    }

    const prompt = `You are a men's fashion classifier. Examine this garment photo and validate or correct the existing classification.

CURRENT CLASSIFICATION:
- Type: ${current.type ?? "unknown"}
- Color: ${current.color ?? "unknown"}
- Name: ${current.name ?? "unknown"}
- Formality: ${current.formality ?? "??"}/10

VALID TYPES: shirt, pants, shoes, jacket, sweater, belt, accessory, bag, hat, scarf, sunglasses, outfit-photo

TASK: Does the photo match the current classification? Be direct and critical.

Respond ONLY with valid JSON, no markdown:
{
  "confirmed": true/false,
  "confidence": 0.0-1.0,
  "reason": "1 sentence explaining what you see and why you confirm/correct",
  "corrections": {
    "type": "corrected type or null if correct",
    "color": "corrected color (single word: black/white/navy/brown/grey/green/blue/beige/cream/burgundy/olive/tan/khaki/charcoal/red/teal) or null if correct",
    "name": "suggested better name or null if correct",
    "formality": corrected 1-10 score or null if correct
  }
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            imageBlock,
            { type: "text", text: prompt },
          ],
        }],
      }),
    });


    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: `Claude API error: ${response.status}`, detail: err }) };
    }
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
