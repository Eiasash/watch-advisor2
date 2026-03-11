import { callClaude } from "./_claudeClient.js";
/**
 * Netlify function — AI Wardrobe Audit
 * POST body: { prompt: string }
 * Returns the parsed JSON audit result.
 */

export async function handler(event) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { prompt } = JSON.parse(event.body || "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    const res = await callClaude(apiKey, {
        model:      "claude-sonnet-4-6",
        max_tokens: 2000,
        messages:   [{ role: "user", content: prompt }],
      });


    const raw  = res.content?.[0]?.text ?? "{}";
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: "Invalid JSON from AI", raw: cleaned.slice(0, 400) }) }; }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
  } catch (e) {
    const isClaudeError = String(e.message ?? e).startsWith('Claude API error') || String(e.message ?? e).startsWith('BILLING:');
    return { statusCode: isClaudeError ? 502 : 500, headers: CORS, body: JSON.stringify({ error: String(e.message ?? e) }) };
  }
}
