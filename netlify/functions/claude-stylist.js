/**
 * Netlify serverless function — Claude AI Stylist.
 * Calls Claude API to suggest the best outfit from the user's wardrobe.
 *
 * Environment variable required: CLAUDE_API_KEY
 *
 * POST body: { garments: [...], watch: {...}, weather: {...} }
 * Returns: { shirt, pants, shoes, jacket, explanation }
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
    const { garments, watch, weather } = JSON.parse(event.body);

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
      };
    }

    const garmentsSummary = (garments || [])
      .map(g => `- ${g.name} (${g.type || g.category}, ${g.color}, formality ${g.formality}/10)`)
      .join("\n");

    const watchInfo = watch
      ? `${watch.brand} ${watch.model} — ${watch.dial} dial, ${watch.style} style, formality ${watch.formality}/10, ${watch.strap} strap`
      : "No watch selected";

    const weatherInfo = weather
      ? `${weather.tempC}°C, ${weather.description || "Unknown conditions"}`
      : "Weather unknown";

    const prompt = `You are a minimalist menswear stylist specializing in watch-first outfit coordination.

User wardrobe:
${garmentsSummary}

Selected watch:
${watchInfo}

Weather:
${weatherInfo}

Context: The user works in a hospital setting and typically dresses hospital smart casual.

Suggest the best outfit built around this watch. The outfit should:
1. Match the watch's formality level
2. Complement the dial color
3. Account for the weather
4. Be appropriate for hospital smart casual

Return ONLY valid JSON in this exact format:
{
  "shirt": "<garment name from wardrobe>",
  "pants": "<garment name from wardrobe>",
  "shoes": "<garment name from wardrobe>",
  "jacket": "<garment name or null>",
  "explanation": "<2-3 sentence explanation of why this outfit works with the watch>"
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
        max_tokens: 500,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestion = JSON.parse(jsonMatch[0]);
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(suggestion),
      };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        shirt: null,
        pants: null,
        shoes: null,
        jacket: null,
        explanation: text || "Could not generate suggestion.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
