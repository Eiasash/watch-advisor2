// tests/authSubscriptionUniqueness.test.js
//
// Guard rail for v1.13.46+'s shared authStore design.
//
// Only `src/stores/authStore.js` is allowed to call `getSession()` /
// `onAuthStateChange()` from `services/supabaseAuth.js` or
// `supabase.auth.onAuthStateChange` directly. Every other consumer must
// read from `useAuthStore(...)`.
//
// Why this matters: redundant subscriptions waste a session check on every
// component mount, produce inconsistent state during transitions (each
// subscriber updates its own local copy on its own schedule), and re-create
// the exact UX bug v1.13.46 fixed (sign-in flash on real authed reloads).
//
// Allowed:
//   - src/stores/authStore.js  (the store itself)
//   - src/services/authedFetch.js  (needs the JWT for the Authorization header)
//   - src/services/supabaseAuth.js  (the wrapper around supabase.auth)
//   - tests/**                  (test helpers may stub)

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

const ALLOWED = new Set([
  "src/stores/authStore.js",
  "src/services/authedFetch.js",
  "src/services/supabaseAuth.js",
]);

const PATTERNS = [
  /\bonAuthStateChange\s*\(/,        // any onAuthStateChange call
  /\bsupabase\.auth\.getSession\s*\(/, // direct getSession via supabase client
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".jsx") || full.endsWith(".js")) out.push(full);
  }
  return out;
}

describe("auth subscription uniqueness", () => {
  it("only authStore.js / authedFetch.js / supabaseAuth.js may subscribe to auth events", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      // Normalize to forward slashes — path.relative() yields backslashes on
      // Windows, which never match the forward-slash ALLOWED entries (the test
      // passed on Linux CI but flagged the allowed files as offenders locally).
      const rel = relative(join(SRC, ".."), file).split(sep).join("/");
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const re of PATTERNS) {
        const m = text.match(re);
        if (m) {
          // Find line number of first match
          const idx = text.indexOf(m[0]);
          const line = text.slice(0, idx).split("\n").length;
          offenders.push({ file: rel, line, pattern: re.toString() });
          break;
        }
      }
    }
    const report = offenders.map(o => `  ${o.file}:${o.line} — matches ${o.pattern}`).join("\n");
    expect(
      offenders,
      `\nFound ${offenders.length} forbidden auth subscription(s):\n${report}\n\n` +
      `Read from useAuthStore(s => s.user / s.isAuthed) instead. ` +
      `Only src/stores/authStore.js owns the live subscription.`,
    ).toEqual([]);
  });
});
