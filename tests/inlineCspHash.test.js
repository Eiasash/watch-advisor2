import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  extractInlineScriptHashes,
  rewriteHeadersWithHashes,
  SENTINEL,
} from "../scripts/inlineCspHash.mjs";

describe("extractInlineScriptHashes", () => {
  it("extracts a SHA-256 base64 hash for a single inline script", () => {
    const html = "<html><body><script>console.log(1)</script></body></html>";
    const hashes = extractInlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  it("ignores <script src=...> (external) but matches inline", () => {
    const html =
      '<script src="/main.js"></script><script>inlineCode()</script>';
    expect(extractInlineScriptHashes(html)).toHaveLength(1);
  });

  it("returns empty array when no inline scripts exist", () => {
    expect(extractInlineScriptHashes('<script src="/m.js"></script>')).toEqual([]);
  });

  it("handles multiple inline scripts", () => {
    const html = "<script>a</script><script>b</script>";
    expect(extractInlineScriptHashes(html)).toHaveLength(2);
  });

  it("hash is byte-sensitive: whitespace changes change the hash", () => {
    const a = extractInlineScriptHashes("<script>x</script>");
    const b = extractInlineScriptHashes("<script>x </script>");
    expect(a[0]).not.toBe(b[0]);
  });

  it("matches Node crypto's SHA-256 of the raw script body", () => {
    const body = "var CACHE_VERSION = 8;";
    const html = `<script>${body}</script>`;
    const expected = createHash("sha256").update(body, "utf8").digest("base64");
    expect(extractInlineScriptHashes(html)[0]).toBe(`'sha256-${expected}'`);
  });

  it("ignores type=module attribute on external src tags but extracts inline ones", () => {
    const html =
      '<script type="module" src="/main.js"></script><script type="module">x()</script>';
    expect(extractInlineScriptHashes(html)).toHaveLength(1);
  });
});

describe("rewriteHeadersWithHashes", () => {
  it("substitutes the sentinel with a single hash", () => {
    const headers = `script-src 'self' ${SENTINEL} https://cdn.jsdelivr.net`;
    const out = rewriteHeadersWithHashes(headers, ["'sha256-abc='"]);
    expect(out).toBe("script-src 'self' 'sha256-abc=' https://cdn.jsdelivr.net");
    expect(out).not.toContain("PLACEHOLDER");
  });

  it("joins multiple hashes with single spaces in CSP order", () => {
    const headers = `script-src 'self' ${SENTINEL}`;
    const out = rewriteHeadersWithHashes(headers, ["'sha256-a='", "'sha256-b='"]);
    expect(out).toContain("'sha256-a=' 'sha256-b='");
  });

  it("throws a descriptive error when sentinel is missing", () => {
    expect(() => rewriteHeadersWithHashes("script-src 'self'", ["'sha256-x='"]))
      .toThrowError(/sentinel/);
  });

  it("returns headers unchanged when no hashes are passed", () => {
    const headers = "script-src 'self' https://cdn.jsdelivr.net";
    expect(rewriteHeadersWithHashes(headers, [])).toBe(headers);
  });

  it("only replaces the sentinel inside script-src — not in a comment line that mentions it", () => {
    // Regression: a comment referencing the literal sentinel must NOT be
    // substituted; only the script-src directive value itself should be.
    const headers = `# NOTE: ${SENTINEL} is a build-time placeholder, see scripts/inlineCspHash.mjs

/*
  Content-Security-Policy: default-src 'self'; script-src 'self' ${SENTINEL} https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'
`;
    const out = rewriteHeadersWithHashes(headers, ["'sha256-real='"]);
    // Comment line keeps the literal sentinel
    expect(out).toContain(`# NOTE: ${SENTINEL} is a build-time placeholder`);
    // Directive line gets the real hash
    expect(out).toContain("script-src 'self' 'sha256-real=' https://cdn.jsdelivr.net");
    // No surviving placeholder inside any script-src directive
    expect(out).not.toMatch(/script-src[^;\n]*INLINE_SCRIPT_PLACEHOLDER/);
  });

  it("throws when the sentinel exists only outside a script-src directive", () => {
    // Sentinel in a comment but not in script-src — plugin must reject because
    // the deployed CSP would be broken silently.
    const headers = `# this header file mentions ${SENTINEL} only in prose
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net
`;
    expect(() => rewriteHeadersWithHashes(headers, ["'sha256-x='"])).toThrowError(
      /script-src/,
    );
  });
});
