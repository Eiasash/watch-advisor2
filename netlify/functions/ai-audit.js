import { callClaude, extractText } from "./_claudeClient.js";
import { cors } from "./_cors.js";
/**
 * Netlify function — AI Wardrobe Audit
 * POST body: { prompt: string }
 * Returns the parsed JSON audit result.
 */

export async function handler(event) {
  const CORS = cors(event);
  const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { prompt } = JSON.parse(event.body || "{}");
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: "CLAUDE_API_KEY not set" }) };

    const res = await callClaude(apiKey, {
        model:      "claude-sonnet-4-6",
        max_tokens: 2000,
        messages:   [{ role: "user", content: prompt }],
      });


    const raw  = extractText(res);
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ error: "Invalid JSON from AI", raw: cleaned.slice(0, 400) }) }; }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(parsed) };
  } catch (e) {
    const isClaudeError = String(e.message ?? e).startsWith('Claude API error') || String(e.message ?? e).startsWith('BILLING:');
    return { statusCode: isClaudeError ? 502 : 500, headers: JSON_HEADERS, body: JSON.stringify({ error: String(e.message ?? e) }) };
  }
}
