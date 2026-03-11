/**
 * Netlify serverless function — OpenAI text-embedding-3-small.
 * Generates a 1536-dim embedding for a garment description.
 * Stored in garments.embedding for semantic wardrobe search.
 *
 * POST body: { garmentId, text }
 * Returns: { embedding: number[] } or { error }
 *
 * Cache: Results stored in Netlify Blobs keyed by FNV hash of the text.
 * Same garment description = instant cache hit, zero OpenAI call.
 *
 * Requires: OPENAI_API_KEY env var in Netlify dashboard.
 */

import { cacheGet, cacheSet, hashText } from "./_blobCache.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: "OPENAI_API_KEY not configured" }) };
  }

  try {
    const { garmentId, text } = JSON.parse(event.body ?? "{}");
    if (!text?.trim()) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "text required" }) };

    const normalised = text.trim().slice(0, 512);
    const cacheKey = `embed:${hashText(normalised)}`;

    // ── Cache check ──────────────────────────────────────────────────────────
    const cached = await cacheGet(cacheKey);
    if (cached?.embedding) {
      return {
        statusCode: 200,
        headers: { ...CORS, "X-Cache": "HIT" },
        body: JSON.stringify({ garmentId, embedding: cached.embedding }),
      };
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: normalised }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `OpenAI error: ${err}` }) };
    }

    const { data } = await res.json();
    const embedding = data?.[0]?.embedding ?? null;
    if (!embedding) return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "No embedding returned" }) };

    // ── Cache write ──────────────────────────────────────────────────────────
    cacheSet(cacheKey, { embedding }); // fire-and-forget

    return {
      statusCode: 200,
      headers: { ...CORS, "X-Cache": "MISS" },
      body: JSON.stringify({ garmentId, embedding }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
}
