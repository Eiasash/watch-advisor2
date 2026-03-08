import { callClaude } from "./_claudeClient.js";
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

    const response = await callClaude(apiKey, {
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
                text: 'Identify the clothing item type, exact color, and formality level (1=very casual, 10=black tie). Be precise about color — distinguish between similar shades. Return JSON only: {"type": "shirt"|"pants"|"shoes"|"jacket"|"sweater"|"belt"|"hat"|"scarf"|"bag"|"accessory", "color": "beige"|"black"|"blue"|"brown"|"burgundy"|"camel"|"charcoal"|"cognac"|"coral"|"cream"|"dark brown"|"dark green"|"dark navy"|"denim"|"gold"|"green"|"grey"|"ivory"|"khaki"|"lavender"|"light blue"|"maroon"|"mint"|"multicolor"|"navy"|"olive"|"orange"|"pink"|"purple"|"red"|"rust"|"sage"|"sand"|"silver"|"slate"|"tan"|"taupe"|"teal"|"white"|"wine"|"yellow", "formality": <1-10>}',
              },
            ],
          },
        ],
      });


    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
