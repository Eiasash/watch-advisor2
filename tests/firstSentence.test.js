import { describe, it, expect } from "vitest";
import { firstSentence, hasMoreThanSummary } from "../src/utils/firstSentence.js";

describe("firstSentence (PR #153)", () => {
  it("text shorter than maxLen → returned as-is", () => {
    expect(firstSentence("Short reasoning.", 100)).toBe("Short reasoning.");
  });

  it("trims surrounding whitespace", () => {
    expect(firstSentence("   short.   ", 100)).toBe("short.");
  });

  it("cuts at first sentence boundary when text exceeds maxLen", () => {
    const text = "New white linen shirt + under-worn khaki chinos, weather fits. The strap should be brown leather to match the shoes and the warm tones of the day's palette.";
    const result = firstSentence(text, 100);
    expect(result).toBe("New white linen shirt + under-worn khaki chinos, weather fits.");
  });

  it("falls back to word-boundary + ellipsis when no sentence break in budget", () => {
    const text = "very long compound clause with no sentence punctuation flowing on and on without a single full stop anywhere visible";
    const result = firstSentence(text, 50);
    expect(result.length).toBeLessThanOrEqual(51); // 50 + ellipsis
    expect(result).toMatch(/…$/);
    expect(result).not.toMatch(/\s…$/); // no space before ellipsis
  });

  it("char-truncates when no word boundary near limit (single huge word)", () => {
    const text = "supercalifragilisticexpialidocioussupercalifragilisticexpialidocious";
    const result = firstSentence(text, 20);
    expect(result.length).toBe(21); // 20 + ellipsis
    expect(result).toMatch(/…$/);
  });

  it("ignores tiny sentence breaks (e.g. abbreviation 'Mr. ') — needs >=12 chars", () => {
    // "Mr. " would otherwise be picked as a sentence end
    const text = "Mr. Bond looked at the watch and decided it was time to leave the building immediately.";
    const result = firstSentence(text, 60);
    expect(result.length).toBeGreaterThan(12);
    expect(result).not.toBe("Mr.");
  });

  it("missing/invalid input → empty string", () => {
    expect(firstSentence(null)).toBe("");
    expect(firstSentence(undefined)).toBe("");
    expect(firstSentence("")).toBe("");
    expect(firstSentence("   ")).toBe("");
    expect(firstSentence(42)).toBe("");
  });
});

describe("hasMoreThanSummary (PR #153)", () => {
  it("true when text exceeds maxLen", () => {
    expect(hasMoreThanSummary("a".repeat(101), 100)).toBe(true);
  });

  it("false when text fits within maxLen", () => {
    expect(hasMoreThanSummary("Short text.", 100)).toBe(false);
  });

  it("false for null/empty", () => {
    expect(hasMoreThanSummary(null, 100)).toBe(false);
    expect(hasMoreThanSummary("", 100)).toBe(false);
  });
});
