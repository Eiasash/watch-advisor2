/**
 * Returns the GitHub PAT for CI/Claude Code access.
 * Authenticated via x-api-secret header (matches OPEN_API_KEY env var).
 */
export default async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }

  const secret = event.headers["x-api-secret"];
  if (!secret || secret !== process.env.OPEN_API_KEY) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GITHUB_PAT not configured" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pat }),
  };
}
