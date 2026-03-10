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
    if (ct.includes("json")) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Server error ${res.status}`);
    }
    throw new Error(`Server error ${res.status}`);
  }

  if (!ct.includes("json")) {
    throw new Error("Unexpected non-JSON response from server");
  }

  return res.json();
}
