/**
 * Netlify function — AI garment photo verifier.
 * Takes a garment's thumbnail + current labels, asks Claude Vision if they're correct.
 * Returns: { ok, correctedType, correctedColor, correctedName, confidence, reason }
 *
 * POST body: { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId }
 */

const VALID_TYPES  = ["shirt","pants","shoes","jacket","sweater","belt","accessory","watch","outfit-photo"];
const VALID_COLORS = ["black","white","navy","blue","grey","brown","tan","beige","cream","ecru",
                      "green","olive","teal","khaki","stone","burgundy","red","pink","orange",
                      "yellow","purple","charcoal","dark brown","light blue","dark navy","coral","multicolor"];

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type" } };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { imageUrl, imageBase64, currentType, currentColor, currentName, garmentId } = JSON.parse(event.body ?? "{}");

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    // Build image content block — prefer base64, fall back to URL
    let imageBlock;
    if (imageBase64) {
      const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const mediaType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };
    } else if (imageUrl) {
      // Fetch the image and convert to base64
      const imgRes = await fetch(imageUrl);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const ct = imgRes.headers.get("content-type") || "image/jpeg";
      imageBlock = { type: "image", source: { type: "base64", media_type: ct, data: b64 } };
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const prompt = `You are a wardrobe AI classifying garment photos. Current labels for this item:
- Type: ${currentType ?? "unknown"}
- Color: ${currentColor ?? "unknown"}
- Name: ${currentName ?? "unknown"}

Look at the photo carefully and respond with ONLY a JSON object (no markdown, no extra text):

{
  "ok": true/false,
  "correctedType": "${currentType ?? "shirt"}" (use current if correct, else one of: ${VALID_TYPES.join(", ")}),
  "correctedColor": "${currentColor ?? "black"}" (use current if correct, else one of: ${VALID_COLORS.join(", ")}),
  "correctedName": "${currentName ?? ""}" (short descriptive name, max 5 words),
  "confidence": 0.0-1.0,
  "reason": "one sentence: what you see and whether labels match"
}

Set ok=true if type AND color are both correct. Set ok=false if either is wrong.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{ role: "user", content: [imageBlock, { type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: `Claude API error: ${res.status}`, detail: err }) };
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? "{}";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ garmentId, ...parsed }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
