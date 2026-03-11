/**
 * Safe JSON fetch — guards against HTML error pages from Netlify 502/504.
 * Use for ALL Netlify function calls.
 * Returns parsed JSON or throws with a clear error message.
 */
export async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    if (res.status === 502 || res.status === 504) {
      throw new Error(`Function timed out (${res.status}). Try again.`);
    }
    // Try JSON error body even if content-type header is missing
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Server error ${res.status}`);
  }

  // If content-type is set to JSON, use standard path
  if (ct.includes("json")) return res.json();

  // Status 200 but content-type missing/wrong — Netlify sometimes omits it.
  // Attempt to parse body as JSON anyway before giving up.
  const text = await res.text();
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (_) {
    throw new Error("Unexpected non-JSON response from server");
  }
}
