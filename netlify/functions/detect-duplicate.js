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
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
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

        const response = await callClaude(apiKey, {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageA },
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageB },
              },
              {
                type: "text",
                text: 'Are these two photos of the SAME clothing item (possibly from different angles, lighting, or backgrounds)? Return ONLY JSON: {"isDuplicate": true/false, "confidence": "high"/"medium"/"low", "reason": "<brief reason>"}',
              },
            ],
          },
        ],
      });


      const err = await response.text();
      return { statusCode: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: `Claude API error: ${response.status}`, detail: err }) };
    }
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
