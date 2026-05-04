/**
 * Extract a short summary from longer text. Used for the "Why:" preview line
 * on AI cards so the reasoning panel doesn't dominate the card.
 *
 * Strategy:
 *   1. If text already fits within maxLen, return as-is.
 *   2. Otherwise try to cut at the first sentence-ending punctuation
 *      (`.!?` followed by whitespace) within the budget.
 *   3. Otherwise fall back to a word boundary near maxLen with ellipsis.
 *
 * Returns "" for null/undefined/empty input so callers can render safely.
 */
export function firstSentence(text, maxLen = 100) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= maxLen) return trimmed;

  // Sentence boundary within budget — most natural cut.
  const sentenceMatch = trimmed.slice(0, maxLen + 1).match(/^.*?[.!?](?=\s|$)/);
  if (sentenceMatch && sentenceMatch[0].length >= 12) {
    return sentenceMatch[0];
  }

  // Fall back: word boundary near the limit, with ellipsis.
  const slice = trimmed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    return slice.slice(0, lastSpace) + "…";
  }
  return slice + "…";
}

/**
 * Returns true if the full text differs meaningfully from its summary —
 * i.e., there's something extra to expand to. Used to gate the "More"
 * affordance so we don't show a useless expander when text already fits.
 */
export function hasMoreThanSummary(text, maxLen = 100) {
  if (!text || typeof text !== "string") return false;
  return text.trim().length > maxLen;
}
