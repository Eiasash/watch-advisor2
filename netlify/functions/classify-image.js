/**
 * Netlify serverless function — Claude Vision fallback classifier.
 * Only called when the pixel classifier has low confidence.
 *
 * Environment variable required: CLAUDE_API_KEY
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" } };
  }

  try {
    const { image } = JSON.parse(event.body ?? "{}");

    if (!image) {
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: 'Identify the clothing item type, color, and formality level. Return JSON: {"type": "shirt"|"pants"|"shoes"|"jacket"|"sweater", "color": "navy"|"gray"|"brown"|"black"|"white"|"olive"|"tan"|"beige", "formality": <1-10>}',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: `Claude API error: ${response.status}`, detail: err }) };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
