/**
 * Tests for cardSourceLabel — guards the "Logged" word from drifting onto
 * non-history cards (the whole reason this util exists per PR #149 critique).
 */
import { describe, it, expect } from "vitest";
import {
  cardSourceLabel,
  cardSourceColor,
  CARD_SOURCE_LABELS,
  CARD_SOURCE_COLORS,
} from "../src/utils/cardSourceLabel.js";

describe("cardSourceLabel", () => {
  it("ai_rec → 'AI recommendation' (fresh Claude call)", () => {
    expect(cardSourceLabel("ai_rec")).toBe("AI recommendation");
  });

  it("ai_rec_cached → 'Cached AI recommendation' (PR #145 cache hit)", () => {
    expect(cardSourceLabel("ai_rec_cached")).toBe("Cached AI recommendation");
  });

  it("logged → 'Logged outfit' (must NOT appear on AI cards)", () => {
    expect(cardSourceLabel("logged")).toBe("Logged outfit");
  });

  it("manual → 'Manual override' (shuffle / slot picker, no AI / no log)", () => {
    expect(cardSourceLabel("manual")).toBe("Manual override");
  });

  it("unknown source → null (caller can `&&` it cleanly)", () => {
    expect(cardSourceLabel("anything_else")).toBeNull();
    expect(cardSourceLabel(undefined)).toBeNull();
    expect(cardSourceLabel(null)).toBeNull();
    expect(cardSourceLabel("")).toBeNull();
  });

  it("'Logged' word appears ONLY for source='logged' — semantic drift guard", () => {
    // If a future PR adds a label like "AI Logged" or "Logged AI" it'd be
    // semantically wrong (the word implies history-backing). Lock that down.
    for (const [source, label] of Object.entries(CARD_SOURCE_LABELS)) {
      if (source === "logged") {
        expect(label.toLowerCase()).toContain("logged");
      } else {
        expect(label.toLowerCase()).not.toContain("logged");
      }
    }
  });

  it("table is frozen — no runtime mutation possible", () => {
    expect(Object.isFrozen(CARD_SOURCE_LABELS)).toBe(true);
    expect(Object.isFrozen(CARD_SOURCE_COLORS)).toBe(true);
  });
});

describe("cardSourceColor", () => {
  it("each label source has a color", () => {
    for (const source of Object.keys(CARD_SOURCE_LABELS)) {
      expect(cardSourceColor(source)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("ai_rec and ai_rec_cached use distinct colors so user can spot cache hits", () => {
    expect(cardSourceColor("ai_rec")).not.toBe(cardSourceColor("ai_rec_cached"));
  });

  it("unknown source → null", () => {
    expect(cardSourceColor("nope")).toBeNull();
  });
});
