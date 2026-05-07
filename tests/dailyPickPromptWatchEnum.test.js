/**
 * Regression guard for the 2026-05-07 incident.
 *
 * The daily-pick.js system + user prompts contain a hardcoded watchId enum
 * the model is told to pick from. Twice (line 120 system, line 443 user) the
 * enum drifted from the canonical seed IDs in src/data/watchSeed.js — it
 * shipped with names like `gp_laureato`, `ap_royal_oak`, `gmt_master`,
 * `chopard_alpine`, `santos_35_rep`, `daydate_turq`, `rolex_op_grape`. Claude
 * faithfully echoed those, the validator rejected every Different-watch
 * reply, and the user saw mismatched reasoning text glued to the rotation
 * fallback watch.
 *
 * This test reads the daily-pick.js source and asserts:
 *   1. Every ID in the prompt enum exists in watchSeed.js
 *   2. No legacy/wrong IDs survive (the specific tokens that broke the app)
 *
 * If you add or remove a watch in watchSeed, also update the enum in
 * daily-pick.js — this test will fail until you do.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dailyPickSource = readFileSync(
  resolve(__dirname, "../netlify/functions/daily-pick.js"),
  "utf8"
);

// Pull every "watchId — must EXACTLY match one of these..." enum from the source.
// The format is `watchId — must EXACTLY match one of these (...): a|b|c|...`.
function extractEnums(src) {
  const re = /"watchId":\s*"watch_id[^"]*?:\s*([a-z0-9_|\-]+)"/g;
  const enums = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    enums.push(m[1].split("|"));
  }
  return enums;
}

// Canonical = seed IDs of all NON-pending watches. Pending watches must NOT
// appear in the enum (they're not eligible for rotation), but if Eias takes
// delivery and flips `pending:true` → false, this test will fail until the
// enum is updated. Intentional — forces author to include the new watch.
const canonicalActiveIds = WATCH_COLLECTION
  .filter(w => !w.pending && !w.retired)
  .map(w => w.id)
  .sort();

const enums = extractEnums(dailyPickSource);

describe("daily-pick.js — watchId enum integrity", () => {
  it("source contains at least one watchId enum (sanity check)", () => {
    expect(enums.length).toBeGreaterThan(0);
  });

  it("system prompt + user prompt both contain the enum (two occurrences)", () => {
    expect(enums.length).toBe(2);
  });

  it.each([
    ["gp_laureato",     "laureato"],
    ["ap_royal_oak",    "royal_oak"],
    ["gmt_master",      "gmt"],
    ["chopard_alpine",  "alpine_eagle"],
    ["santos_35_rep",   "santos_35"],
    ["daydate_turq",    "daydate"],
    ["rolex_op_grape",  "op_grape"],
  ])("legacy id %s never appears in the prompt (should be %s)", (legacy) => {
    for (const enumIds of enums) {
      expect(enumIds).not.toContain(legacy);
    }
  });

  it("every id in every enum is a real watch in watchSeed", () => {
    const seedIds = new Set(WATCH_COLLECTION.map(w => w.id));
    for (const enumIds of enums) {
      for (const id of enumIds) {
        expect(seedIds.has(id)).toBe(true);
      }
    }
  });

  it("every active (non-pending) watch in the seed appears in every enum", () => {
    for (const enumIds of enums) {
      for (const seedId of canonicalActiveIds) {
        expect(enumIds).toContain(seedId);
      }
    }
  });

  it("pending watches are NOT exposed to the AI as pickable", () => {
    const pendingIds = WATCH_COLLECTION.filter(w => w.pending).map(w => w.id);
    for (const enumIds of enums) {
      for (const pendingId of pendingIds) {
        expect(enumIds).not.toContain(pendingId);
      }
    }
  });

  it("both prompt enums match each other (no drift between system/user blocks)", () => {
    if (enums.length === 2) {
      expect([...enums[0]].sort()).toEqual([...enums[1]].sort());
    }
  });
});
