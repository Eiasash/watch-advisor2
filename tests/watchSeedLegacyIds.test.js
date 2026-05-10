/**
 * Regression guard for strap ID renames and their alias map.
 *
 * History (pre-v1.13.40): the Rikka SS bracelet was misleadingly named
 * `rikka-titanium-bracelet` (Rikka is steel; Snowflake is the titanium GS).
 * Some history rows also used `rikka-bracelet-ss`. Both were renamed to the
 * canonical `rikka-bracelet` in v1.13.40 with:
 *   1. seed rename in src/data/watchSeed.js
 *   2. alias map in src/data/strapAliases.js (covers user IDB caches)
 *   3. Supabase migration normalizing history.payload->>'strapId'
 *
 * This test enforces all three remain in sync. If you're here because this
 * test failed: do NOT silently delete an alias entry — users with old IDB
 * caches still need it. Instead, audit history with the matching SQL in
 * supabase/migrations/ and confirm zero remaining rows before pruning.
 */
import { describe, it, expect } from "vitest";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";
import { STRAP_ID_ALIASES, canonicalStrapId, canonicalizeActiveStraps } from "../src/data/strapAliases.js";

describe("watchSeed canonical strap IDs", () => {
  it("rikka-bracelet exists, is steel, and is the canonical bracelet", () => {
    const rikka = WATCH_COLLECTION.find(w => w.id === "rikka");
    expect(rikka).toBeTruthy();
    const bracelet = rikka.straps.find(s => s.id === "rikka-bracelet");
    expect(bracelet, "rikka-bracelet strap missing — see test docstring").toBeTruthy();
    expect(bracelet.label).toMatch(/stainless\s*steel/i);
    expect(bracelet.label).not.toMatch(/^titanium/i); // Rikka bracelet is NOT titanium
    expect(bracelet.type).toBe("bracelet");
  });

  it("rikka-titanium-bracelet is gone from seed (renamed in v1.13.40)", () => {
    const rikka = WATCH_COLLECTION.find(w => w.id === "rikka");
    const legacy = rikka.straps.find(s => s.id === "rikka-titanium-bracelet");
    expect(legacy, "legacy ID should be removed from seed; alias map covers stale IDB").toBeUndefined();
  });

  it("rikka-bracelet-ss is gone from seed", () => {
    const rikka = WATCH_COLLECTION.find(w => w.id === "rikka");
    const legacy = rikka.straps.find(s => s.id === "rikka-bracelet-ss");
    expect(legacy).toBeUndefined();
  });

  it("snowflake-titanium-bracelet exists and IS actually titanium", () => {
    // Sanity contrast — Snowflake's titanium is real, not a legacy mislabel.
    const sf = WATCH_COLLECTION.find(w => w.id === "snowflake");
    expect(sf).toBeTruthy();
    const bracelet = sf.straps.find(s => s.id === "snowflake-titanium-bracelet");
    expect(bracelet).toBeTruthy();
    expect(bracelet.label).toMatch(/titanium/i);
  });
});

describe("strap ID alias map", () => {
  it("aliases both legacy Rikka IDs to the canonical rikka-bracelet", () => {
    expect(STRAP_ID_ALIASES["rikka-titanium-bracelet"]).toBe("rikka-bracelet");
    expect(STRAP_ID_ALIASES["rikka-bracelet-ss"]).toBe("rikka-bracelet");
  });

  it("canonicalStrapId returns canonical for legacy IDs and identity otherwise", () => {
    expect(canonicalStrapId("rikka-titanium-bracelet")).toBe("rikka-bracelet");
    expect(canonicalStrapId("rikka-bracelet-ss")).toBe("rikka-bracelet");
    expect(canonicalStrapId("rikka-bracelet")).toBe("rikka-bracelet");
    expect(canonicalStrapId("snowflake-titanium-bracelet")).toBe("snowflake-titanium-bracelet");
    expect(canonicalStrapId("speedy-bracelet")).toBe("speedy-bracelet");
  });

  it("canonicalStrapId is null/undefined-safe", () => {
    expect(canonicalStrapId(null)).toBeNull();
    expect(canonicalStrapId(undefined)).toBeUndefined();
    expect(canonicalStrapId("")).toBe("");
  });

  it("canonicalizeActiveStraps normalizes a watch_id → strap_id map", () => {
    const input = {
      rikka: "rikka-titanium-bracelet",
      snowflake: "snowflake-titanium-bracelet",
      pasha: "pasha-navy-alligator",
      ghost: "rikka-bracelet-ss", // contrived but exercises full map
    };
    const out = canonicalizeActiveStraps(input);
    expect(out.rikka).toBe("rikka-bracelet");
    expect(out.snowflake).toBe("snowflake-titanium-bracelet");
    expect(out.pasha).toBe("pasha-navy-alligator");
    expect(out.ghost).toBe("rikka-bracelet");
  });

  it("canonicalizeActiveStraps is null/undefined-safe", () => {
    expect(canonicalizeActiveStraps(null)).toBeNull();
    expect(canonicalizeActiveStraps(undefined)).toBeUndefined();
  });

  it("every alias target resolves to a strap that EXISTS in the current seed", () => {
    // Catches the case where an alias points at a target that itself got renamed.
    const allCurrentIds = new Set(
      WATCH_COLLECTION.flatMap(w => (w.straps ?? []).map(s => s.id))
    );
    for (const [legacy, canonical] of Object.entries(STRAP_ID_ALIASES)) {
      expect(allCurrentIds.has(canonical),
        `alias ${legacy} → ${canonical} but ${canonical} is not in current seed`)
        .toBe(true);
    }
  });
});
