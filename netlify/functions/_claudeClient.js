import { createClient } from '@supabase/supabase-js';

// Module-scope cache — one DB read per cold start
let _cachedModel = null;

/**
 * Read the active Claude model from app_config table.
 * Falls back to hardcoded default if DB read fails.
 */
export async function getConfiguredModel() {
  if (_cachedModel) return _cachedModel;
  const DEFAULT_MODEL = "claude-sonnet-4-6";
  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return DEFAULT_MODEL;
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'claude_model')
      .single();
    const raw = data?.value;
    // Supabase auto-parses JSONB — value is usually already a JS string.
    // But some clients/tests pass JSON-encoded strings like '"model-name"'.
    // Try JSON.parse first (handles quoted strings), fall back to raw string.
    let model = DEFAULT_MODEL;
    if (typeof raw === "string") {
      try { model = JSON.parse(raw); } catch { model = raw; }
    } else if (raw) {
      model = String(raw);
    }
    _cachedModel = model || DEFAULT_MODEL;
    return model;
  } catch {
    return DEFAULT_MODEL;
  }
}

// Reset cache (for testing)
export function _resetModelCache() { _cachedModel = null; }

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
    const data = await res.json();
    // Fire-and-forget token usage logging (don't block response)
    if (data?.usage) {
      _logTokenUsage(data.usage.input_tokens ?? 0, data.usage.output_tokens ?? 0);
    }
    return data;
  }
  throw lastErr ?? new Error("Claude API: max retries exceeded");
}

/**
 * Fire-and-forget: increment monthly token usage in app_config.
 * Never throws — failures are silent to avoid breaking API callers.
 */
function _logTokenUsage(input, output) {
  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    supabase.rpc('increment_token_usage', { p_input: input, p_output: output }).then(
      () => {},
      (err) => console.warn('[token-usage] rpc failed:', err.message)
    );
  } catch { /* swallow */ }
}

/**
 * Extract text from a Claude API response.
 * Handles multi-block responses (thinking + text) by finding the text block.
 * Falls back to content[0].text if no explicit text block found.
 * @param {object} result — full Anthropic messages API response
 * @param {string} [fallback="{}"] — returned if no text found
 * @returns {string}
 */
export function extractText(result, fallback = "{}") {
  const blocks = result?.content;
  if (!Array.isArray(blocks) || !blocks.length) return fallback;
  const textBlock = blocks.find(b => b.type === "text");
  return textBlock?.text ?? blocks[0]?.text ?? fallback;
}
