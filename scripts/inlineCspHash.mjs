import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SENTINEL = "'sha256-INLINE_SCRIPT_PLACEHOLDER='";

const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

export function extractInlineScriptHashes(html) {
  const hashes = [];
  let m;
  INLINE_SCRIPT_RE.lastIndex = 0;
  while ((m = INLINE_SCRIPT_RE.exec(html)) !== null) {
    const sha = createHash("sha256").update(m[1], "utf8").digest("base64");
    hashes.push(`'sha256-${sha}'`);
  }
  return hashes;
}

export function rewriteHeadersWithHashes(headers, hashes, sentinel = SENTINEL) {
  if (hashes.length === 0) return headers;
  // Match the sentinel ONLY when it appears inside a script-src directive value
  // (between `script-src` and the next `;` or end-of-line). This protects against
  // collateral substitution if the sentinel string is referenced in a comment
  // or other header — only the actual CSP directive should be rewritten.
  const escaped = sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directivePattern = new RegExp(`(script-src[^;\\n]*?)${escaped}`);
  if (!directivePattern.test(headers)) {
    throw new Error(
      `inlineCspHash: sentinel ${sentinel} not found inside a script-src directive. ` +
        `Make sure public/_headers' Content-Security-Policy script-src contains it.`,
    );
  }
  return headers.replace(directivePattern, `$1${hashes.join(" ")}`);
}

export function inlineCspHashPlugin({ distDir = "dist" } = {}) {
  return {
    name: "inline-csp-hash",
    apply: "build",
    writeBundle(outputOptions, bundle) {
      const dir = resolve(process.cwd(), outputOptions.dir || distDir);
      const htmlPath = resolve(dir, "index.html");
      const headersPath = resolve(dir, "_headers");
      const htmlAsset = Object.values(bundle).find((asset) => asset.fileName === "index.html");
      const html = htmlAsset && "source" in htmlAsset
        ? String(htmlAsset.source)
        : readFileSync(htmlPath, "utf8");
      if (!existsSync(headersPath)) {
        throw new Error(`inlineCspHash: ${headersPath} was not emitted.`);
      }
      const headers = readFileSync(headersPath, "utf8");
      const hashes = extractInlineScriptHashes(html);
      if (hashes.length === 0) {
        // eslint-disable-next-line no-console
        console.warn("[inline-csp-hash] No inline scripts in index.html — _headers unchanged.");
        return;
      }
      const updated = rewriteHeadersWithHashes(headers, hashes);
      writeFileSync(headersPath, updated);
      // eslint-disable-next-line no-console
      console.log(
        `[inline-csp-hash] Wrote ${hashes.length} inline-script hash(es) to ${headersPath}`,
      );
    },
  };
}
