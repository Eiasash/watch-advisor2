/**
 * contextInference — learns day-of-week → context patterns from history.
 *
 * If you always wear clinic on Sundays and Tuesdays, it knows.
 * Returns the most likely context for today based on wear patterns.
 *
 * Pure function — no stores, no side effects.
 */

/**
 * Analyze history to find day-of-week → context patterns.
 * @param {Array} history — historyStore entries with .date and .context
 * @returns {object} { byDay: { 0: { clinic: 5, smart-casual: 2 }, ... }, todaySuggestion, confidence }
 */
export function inferContext(history) {
  if (!Array.isArray(history) || history.length < 5) {
    return { byDay: {}, todaySuggestion: null, confidence: 0 };
  }

  // Count context per day-of-week (0=Sunday, 6=Saturday)
  const byDay = {}; // { dayNum: { context: count } }
  for (const entry of history) {
    const ctx = entry.context ?? entry.payload?.context;
    if (!ctx || ctx === "null" || ctx === "unset") continue;
    const date = entry.date?.slice(0, 10);
    if (!date) continue;
    // Use noon UTC to avoid DST / timezone ambiguity when parsing ISO date strings
    const dayNum = new Date(date + 'T12:00:00Z').getUTCDay();
    if (!byDay[dayNum]) byDay[dayNum] = {};
    byDay[dayNum][ctx] = (byDay[dayNum][ctx] ?? 0) + 1;
  }

  // Find today's most likely context
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayNum = new Date(todayIso + 'T12:00:00Z').getUTCDay();
  const todayDist = byDay[todayNum] ?? {};
  const entries = Object.entries(todayDist);
  if (!entries.length) return { byDay, todaySuggestion: null, confidence: 0 };

  entries.sort(([, a], [, b]) => b - a);
  const [topCtx, topCount] = entries[0];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const confidence = total > 0 ? +(topCount / total).toFixed(2) : 0;

  return {
    byDay,
    todaySuggestion: confidence >= 0.5 ? topCtx : null, // Only suggest if >50% confidence
    confidence,
    topContext: topCtx,
    totalSamples: total,
  };
}

/**
 * Get human-readable day name from day number.
 */
export function dayName(dayNum) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayNum] ?? "?";
}

/**
 * Format context distribution for a day as a readable string.
 */
export function formatDayPattern(dayDist) {
  if (!dayDist || !Object.keys(dayDist).length) return "no pattern yet";
  const entries = Object.entries(dayDist).sort(([, a], [, b]) => b - a);
  return entries.map(([ctx, n]) => `${ctx}(${n})`).join(", ");
}
