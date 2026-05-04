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

// Icon glyph per source — kept here so future surfaces don't bikeshed
// "is the AI a sparkle or a star?" — they all use ✦.
export const CARD_SOURCE_ICONS = Object.freeze({
  ai_rec: "✦",
  ai_rec_cached: "✦",
  logged: "✓",
  manual: "✎",
});

/**
 * Single resolver for what an outfit card's source is.
 *
 * Priority is intentional:
 *   logged  > AI (fresh or cached)  > manual edits  > nothing
 * If a card is BOTH logged and AI-derived, "logged" wins because it's
 * the more authoritative state — the user committed to it.
 *
 * Returns null when there's nothing to label (engine pick with no edits).
 */
export function resolveCardSource({ isLogged, aiApplied, aiSource, hasManualEdits }) {
  let source = null;
  if (isLogged) source = "logged";
  else if (aiApplied) source = aiSource ?? "ai_rec";
  else if (hasManualEdits) source = "manual";
  if (!source) return null;
  return {
    source,
    label: cardSourceLabel(source),
    color: cardSourceColor(source),
    icon: CARD_SOURCE_ICONS[source],
  };
}

/**
 * Format an ISO timestamp as "HH:MM" in the local timezone.
 * Returns "" for missing/invalid input so callers can `${...}` safely.
 */
export function formatHHMM(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Build the subtitle text for the status line below the day header.
 *   ai_rec        → "Generated HH:MM · Not logged"
 *   ai_rec_cached → "Cached from HH:MM · Not logged"
 *   logged        → "Logged at HH:MM" (or just "Logged" if loggedAt missing)
 *   manual        → "Edited"
 *   null          → ""  (caller should not render)
 */
export function cardStatusSubtitle({ source, generatedAt, loggedAt }) {
  switch (source) {
    case "ai_rec": {
      const t = formatHHMM(generatedAt);
      return t ? `Generated ${t} · Not logged` : "AI recommendation · Not logged";
    }
    case "ai_rec_cached": {
      const t = formatHHMM(generatedAt);
      return t ? `Cached from ${t} · Not logged` : "Cached recommendation · Not logged";
    }
    case "logged": {
      const t = formatHHMM(loggedAt);
      return t ? `Logged at ${t}` : "Logged";
    }
    case "manual":
      return "Edited";
    default:
      return "";
  }
}
