/**
 * Card-source label resolver — single source of truth for outfit-card provenance text.
 *
 * Why a util instead of inline JSX strings:
 *   The word "Logged" carries semantic weight in this app — it means the user
 *   actually wore + recorded an outfit. Once that label drifted onto AI-generated
 *   cards (via copy-paste or sloppy default), the word lost meaning and the user
 *   couldn't tell at a glance whether a card was history or recommendation.
 *   Centralizing the table forces every consumer through the same gate.
 *
 * Source values match the contract from netlify/functions/daily-pick.js:
 *   - "ai_rec"        — fresh Claude call (cardSource set on success)
 *   - "ai_rec_cached" — server-side cache hit (PR #145)
 *   - "logged"        — sourced from history.payload (caller must verify)
 *   - "manual"        — user-only edits (shuffle / slot picker), no AI / no log
 *
 * Returns null for unknown sources so callers can `&&` it cleanly without rendering.
 */

export const CARD_SOURCE_LABELS = Object.freeze({
  ai_rec: "AI recommendation",
  ai_rec_cached: "Cached AI recommendation",
  logged: "Logged outfit",
  manual: "Manual override",
});

export function cardSourceLabel(source) {
  return CARD_SOURCE_LABELS[source] ?? null;
}

// Color mapping for the badge — kept here so future surfaces (Today panel,
// gallery) render the same color per source without re-deciding palette.
// Greens for "real" wears, purple for AI fresh, indigo for cached AI (visually
// distinct from fresh so the user notices), amber for manual edits.
export const CARD_SOURCE_COLORS = Object.freeze({
  ai_rec: "#8b5cf6",
  ai_rec_cached: "#6366f1",
  logged: "#22c55e",
  manual: "#f59e0b",
});

export function cardSourceColor(source) {
  return CARD_SOURCE_COLORS[source] ?? null;
}
