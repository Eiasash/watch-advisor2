/**
 * Shared Claude API client with exponential backoff retry.
 * Handles 529 (overloaded) and 503 with Retry-After header.
 *
 * @param {string} apiKey
 * @param {object} payload  - Anthropic messages API payload
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3] - Reduce to 1 for time-critical functions (Vision)
 * @param {number} [opts.maxDelayMs=8000] - Cap retry delay; Netlify free tier = 10s hard limit
 * @param {AbortSignal} [opts.signal]   - Optional abort signal for caller-controlled timeout
 */
export async function callClaude(apiKey, payload, opts = {}) {
  const { maxAttempts = 3, maxDelayMs = 8000, signal } = opts;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("Claude API: aborted");
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(4, attempt - 1), maxDelayMs);
      await new Promise((r, reject) => {
        const t = setTimeout(r, delay);
        signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
      });
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });
    if ((res.status === 529 || res.status === 503) && attempt < maxAttempts - 1) {
      const ra = res.headers.get("retry-after");
      if (ra) {
        const raDelay = Math.min(parseInt(ra, 10) * 1000, maxDelayMs);
        await new Promise(r => setTimeout(r, raDelay));
      }
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
