/**
 * Shared Claude API client with exponential backoff retry.
 * Handles 529 (overloaded) and 503 with Retry-After header.
 * Max 3 attempts: 2s → 8s → 20s.
 */
export async function callClaude(apiKey, payload) {
  const MAX = 3;
  let lastErr;
  for (let attempt = 0; attempt < MAX; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(4, attempt - 1), 20000)));
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if ((res.status === 529 || res.status === 503) && attempt < MAX - 1) {
      const ra = res.headers.get("retry-after");
      if (ra) await new Promise(r => setTimeout(r, Math.min(parseInt(ra, 10) * 1000, 20000)));
      lastErr = new Error(`Claude ${res.status} (attempt ${attempt + 1})`);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Surface billing errors distinctly — no point retrying these
      if (res.status === 400 && body.includes("credit balance")) {
        throw new Error("BILLING: API credits exhausted — top up at console.anthropic.com/settings/billing");
      }
      throw new Error(`Claude API error: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  }
  throw lastErr ?? new Error("Claude API: max retries exceeded");
}
