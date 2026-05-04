/**
 * Regression guard for legacy strap IDs that look misleading.
 *
 * Specifically: `rikka-titanium-bracelet` is a STAINLESS STEEL bracelet,
 * not titanium. The id is preserved for backward-compat with users'
 * persisted history records (strapStore + history payload reference it
 * by id). The label was corrected in PR #125 from "Titanium bracelet"
 * to "Stainless steel bracelet" with an inline note in useCase.
 *
 * Without this test, a future PR could "clean up" the misleading id
 * (rename to rikka-stainless-steel-bracelet) and silently orphan every
 * user's existing wear-history entry that references the old id.
 *
 * If you're here because this test failed: do NOT rename the id. Add
 * an alias-map migration first if you really need to rename.
 */
import { describe, it, expect } from "vitest";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

describe("watchSeed legacy strap IDs", () => {
  it("rikka-titanium-bracelet exists and is labeled 'Stainless steel bracelet'", () => {
    const rikka = WATCH_COLLECTION.find(w => w.id === "rikka");
    expect(rikka).toBeTruthy();
    const bracelet = rikka.straps.find(s => s.id === "rikka-titanium-bracelet");
    expect(bracelet, "rikka-titanium-bracelet strap missing — DO NOT rename, see test docstring").toBeTruthy();
    expect(bracelet.label).toMatch(/stainless\s*steel/i);
    expect(bracelet.label).not.toMatch(/^titanium/i); // label must not lead with "Titanium"
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
