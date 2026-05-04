/**
 * Tests for cardSourceLabel — guards the "Logged" word from drifting onto
 * non-history cards (the whole reason this util exists per PR #149 critique).
 */
import { describe, it, expect } from "vitest";
import {
  cardSourceLabel,
  cardSourceColor,
  resolveCardSource,
  cardStatusSubtitle,
  formatHHMM,
  CARD_SOURCE_LABELS,
  CARD_SOURCE_COLORS,
  CARD_SOURCE_ICONS,
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

describe("resolveCardSource (PR #151) — priority + null gating", () => {
  it("logged wins over everything, even AI applied + manual edits", () => {
    const r = resolveCardSource({
      isLogged: true, aiApplied: true, aiSource: "ai_rec", hasManualEdits: true,
    });
    expect(r.source).toBe("logged");
    expect(r.label).toBe("Logged outfit");
    expect(r.icon).toBe("✓");
  });

  it("AI applied (no log) — uses provided aiSource", () => {
    const r = resolveCardSource({
      isLogged: false, aiApplied: true, aiSource: "ai_rec_cached", hasManualEdits: false,
    });
    expect(r.source).toBe("ai_rec_cached");
    expect(r.label).toBe("Cached AI recommendation");
  });

  it("AI applied with missing aiSource — defaults to ai_rec (older response shape)", () => {
    const r = resolveCardSource({
      isLogged: false, aiApplied: true, aiSource: undefined, hasManualEdits: false,
    });
    expect(r.source).toBe("ai_rec");
  });

  it("manual edits only (no log, no AI) — manual", () => {
    const r = resolveCardSource({
      isLogged: false, aiApplied: false, aiSource: undefined, hasManualEdits: true,
    });
    expect(r.source).toBe("manual");
    expect(r.icon).toBe("✎");
  });

  it("nothing → null (engine pick with no edits should not show a badge)", () => {
    expect(resolveCardSource({
      isLogged: false, aiApplied: false, aiSource: undefined, hasManualEdits: false,
    })).toBeNull();
  });

  it("each source has a corresponding icon", () => {
    for (const source of Object.keys(CARD_SOURCE_LABELS)) {
      expect(CARD_SOURCE_ICONS[source]).toBeDefined();
    }
  });
});

describe("formatHHMM (PR #151)", () => {
  it("formats ISO timestamp as HH:MM in local time", () => {
    // Pick a date with unambiguous local-vs-UTC handling
    const iso = new Date(2026, 4, 4, 8, 42).toISOString();
    expect(formatHHMM(iso)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("zero-pads single-digit hours and minutes", () => {
    const iso = new Date(2026, 4, 4, 7, 5).toISOString();
    expect(formatHHMM(iso)).toBe("07:05");
  });

  it("missing/invalid input → empty string (not crash)", () => {
    expect(formatHHMM(null)).toBe("");
    expect(formatHHMM(undefined)).toBe("");
    expect(formatHHMM("")).toBe("");
    expect(formatHHMM("not-a-date")).toBe("");
  });
});

describe("cardStatusSubtitle (PR #151)", () => {
  it("ai_rec with timestamp → 'Generated HH:MM · Not logged'", () => {
    const iso = new Date(2026, 4, 4, 8, 42).toISOString();
    expect(cardStatusSubtitle({ source: "ai_rec", generatedAt: iso }))
      .toBe("Generated 08:42 · Not logged");
  });

  it("ai_rec_cached → 'Cached from HH:MM · Not logged' — preserves original time", () => {
    const iso = new Date(2026, 4, 4, 8, 42).toISOString();
    expect(cardStatusSubtitle({ source: "ai_rec_cached", generatedAt: iso }))
      .toBe("Cached from 08:42 · Not logged");
  });

  it("logged with loggedAt → 'Logged at HH:MM'", () => {
    const iso = new Date(2026, 4, 4, 7, 31).toISOString();
    expect(cardStatusSubtitle({ source: "logged", loggedAt: iso }))
      .toBe("Logged at 07:31");
  });

  it("logged without loggedAt (older entry) → 'Logged' fallback", () => {
    expect(cardStatusSubtitle({ source: "logged", loggedAt: null }))
      .toBe("Logged");
  });

  it("manual → 'Edited' (no timestamp tracked yet)", () => {
    expect(cardStatusSubtitle({ source: "manual" })).toBe("Edited");
  });

  it("null source → empty string (caller should not render)", () => {
    expect(cardStatusSubtitle({ source: null })).toBe("");
  });

  it("ai_rec with missing timestamp → graceful fallback (no 'Generated undefined')", () => {
    expect(cardStatusSubtitle({ source: "ai_rec", generatedAt: null }))
      .toBe("AI recommendation · Not logged");
  });
});
