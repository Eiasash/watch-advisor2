/**
 * github-pat.js
 * Returns the GitHub PAT for Claude session access.
 * Authenticated via x-api-secret header (matches OPEN_API_KEY env var).
 *
 * GET /.netlify/functions/github-pat
 * Header: x-api-secret: <OPEN_API_KEY>
 */

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const secret = event.headers["x-api-secret"];
  if (!secret || secret !== process.env.OPEN_API_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return { statusCode: 500, body: JSON.stringify({ error: "GITHUB_PAT not configured" }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pat }),
  };
}
