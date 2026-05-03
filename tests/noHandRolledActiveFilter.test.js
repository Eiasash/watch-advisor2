/**
 * Regression guard — no source file may hand-roll `!retired && !pending`.
 *
 * The audit-fix-deploy bundle (PR #126) centralized active-watch filtering on
 * `src/utils/watchFilters.js` `isActiveWatch()`. Hand-rolled filters silently
 * re-fork as soon as someone adds a new status flag (e.g. `incoming`,
 * `reserved`, `hidden`) — pending watches would re-enter rotation everywhere
 * the helper isn't used.
 *
 * This test fails if any source file (other than the central definition)
 * contains the hand-rolled `!w.retired && !w.pending` pattern in either
 * order. Composing with other conditions is fine — `isActiveWatch(w) && !w.replica`.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

const ALLOWED_BASENAMES = new Set([
  "watchFilters.js", // the centralized definition is allowed to use the literal pattern
]);

function* walkSrc(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkSrc(full);
    } else if (/\.(js|jsx|ts|tsx)$/.test(name)) {
      yield full;
    }
  }
}

describe("active-watch filter centralization", () => {
  test("no source file hand-rolls !retired && !pending — use isActiveWatch", () => {
    // Catches both `!w.retired && !w.pending` and `!w.pending && !w.retired`,
    // any object name (`!watch.retired && !watch.pending` etc.).
    const handRolledRe = /!\s*[\w.]+\.retired\s*&&\s*!\s*[\w.]+\.pending/;
    const handRolledReReversed = /!\s*[\w.]+\.pending\s*&&\s*!\s*[\w.]+\.retired/;

    const violations = [];
    for (const file of walkSrc(SRC)) {
      const base = file.split(/[\\/]/).pop();
      if (ALLOWED_BASENAMES.has(base)) continue;
      const text = readFileSync(file, "utf8");
      if (handRolledRe.test(text) || handRolledReReversed.test(text)) {
        violations.push(file.replace(SRC, "src"));
      }
    }
    expect(
      violations,
      `Use isActiveWatch() from src/utils/watchFilters.js instead of hand-rolling. ` +
      `Composing is fine: \`isActiveWatch(w) && !w.replica\``,
    ).toEqual([]);
  });
});
