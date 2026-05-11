// tests/hooksBeforeEarlyReturn.test.js
//
// Regression guard for React error #300 ("Rendered fewer hooks than expected").
//
// Catches the anti-pattern where a function component has an early `return`
// BEFORE one or more React hooks. When the early-return branch is hit on a
// later render, React sees fewer hooks than the previous render and crashes
// the whole subtree via ErrorBoundary.
//
// Origin: 2026-05-11. `WatchCard` (WatchDashboard.jsx) and `GarmentDetail.jsx`
// both had `if (!prop) return null;` before useState/useMemo/useStrapStore
// calls. Triggered on fresh / unauthenticated sessions where stores are empty
// → activeWatch transitions undefined→defined across renders → hook count
// changes mid-mount → app blanks behind ErrorBoundary.
//
// The check is purely static (regex over source). False positives can opt
// out with a `// hooks-order-ok` comment on the offending line.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "src");

const HOOK_RE = /\buse[A-Z][a-zA-Z0-9]*\s*\(/;
const EARLY_RETURN_RE = /^\s*if\s*\(.+\)\s*return\b/;
const COMPONENT_FN_RE = /^(?:export\s+default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/;
const OPT_OUT_RE = /\/\/\s*hooks-order-ok\b/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".jsx") || full.endsWith(".js")) out.push(full);
  }
  return out;
}

// Count `{` and `}` in a string, ignoring those inside // line comments,
// /* block comments */, single/double quoted strings, and template literals.
function netBraces(line, inBlockComment) {
  let net = 0;
  let i = 0;
  let inLineComment = false;
  let inStr = null;
  let block = inBlockComment;
  while (i < line.length) {
    const c = line[i];
    const c2 = line[i + 1];
    if (inLineComment) break;
    if (block) {
      if (c === "*" && c2 === "/") { block = false; i += 2; continue; }
      i++; continue;
    }
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) { inStr = null; }
      i++; continue;
    }
    if (c === "/" && c2 === "/") { inLineComment = true; break; }
    if (c === "/" && c2 === "*") { block = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
    if (c === "{") net++;
    else if (c === "}") net--;
    i++;
  }
  return { net, blockOpen: block };
}

function scanFile(file, text) {
  const lines = text.split("\n");
  const offenses = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(COMPONENT_FN_RE);
    if (!m) continue;
    const componentName = m[1];

    let depth = 0;
    let started = false;
    let blockOpen = false;
    let earlyReturnLine = null;
    let bodyEnd = lines.length;
    for (let j = i; j < lines.length; j++) {
      const body = lines[j];
      // Capture depth BEFORE this line so we can attribute statements to the
      // depth they execute at. A `}` at the start of a line still belongs to
      // the previous depth.
      const depthBefore = depth;
      const { net, blockOpen: nextBlock } = netBraces(body, blockOpen);
      blockOpen = nextBlock;
      depth += net;
      if (!started && depth > 0) started = true;
      // Rules of Hooks only apply at the immediate component body level
      // (depth === 1). Returns or hooks inside nested callbacks (useMemo
      // bodies, event handlers, map functions, etc.) don't change hook count
      // of the outer render, so don't flag them.
      const atBodyLevel = started && depthBefore === 1 && depth >= 1;
      if (j > i && atBodyLevel) {
        if (earlyReturnLine == null && EARLY_RETURN_RE.test(body) && !OPT_OUT_RE.test(body)) {
          earlyReturnLine = j + 1;
        } else if (earlyReturnLine != null && HOOK_RE.test(body) && !OPT_OUT_RE.test(body)) {
          offenses.push({
            component: componentName,
            file: relative(join(ROOT, ".."), file),
            earlyReturnLine,
            hookLine: j + 1,
            hookSnippet: body.trim().slice(0, 100),
          });
          earlyReturnLine = null;
        }
      }
      if (started && depth === 0) { bodyEnd = j; break; }
    }
    i = bodyEnd;
  }
  return offenses;
}

describe("Rules of Hooks — no hooks after conditional early return", () => {
  it("no component has `if (...) return` before a hook call", () => {
    const files = walk(ROOT);
    const allOffenses = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      allOffenses.push(...scanFile(file, text));
    }
    const report = allOffenses.map(o =>
      `  ${o.file}:${o.hookLine} — ${o.component} has hook \`${o.hookSnippet}\` after early-return at line ${o.earlyReturnLine}`,
    ).join("\n");
    expect(
      allOffenses,
      `\nFound ${allOffenses.length} hooks-after-early-return violation(s):\n${report}\n\n` +
      `Fix by moving the \`if (...) return ...\` AFTER all hook calls. ` +
      `Opt out with \`// hooks-order-ok\` on the early-return line if the component has no hooks below.`,
    ).toEqual([]);
  });
});
