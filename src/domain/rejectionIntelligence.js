/**
 * rejectionIntelligence — learns from rejection history to pre-filter garments.
 *
 * Analyzes patterns in rejectStore to identify:
 * - Garments repeatedly rejected in specific contexts → penalty or exclude
 * - Color combos that consistently fail → avoid pairing
 * - Time-based rejection patterns (e.g. always reject X on clinic days)
 *
 * Returns a penalty function that the scoring engine can call per-garment.
 */

/**
 * Build a rejection penalty map from rejection entries.
 * Returns a function: (garmentId, context) → penalty (-0.30 to 0)
 *
 * Logic:
 *   1 rejection  → no penalty (could be random)
 *   2 rejections → -0.10 (mild signal)
 *   3+ rejections → -0.25 (strong signal — you don't like this combo)
 *   3+ with SAME reason → -0.35 (very strong — systematic dislike)
 *
 * @param {Array} rejectEntries — from rejectStore.entries
 * @returns {{ penaltyFor: (garmentId: string, context: string) => number, insights: Array }}
 */
export function buildRejectionProfile(rejectEntries = []) {
  // Build per-garment rejection counts, optionally scoped by context
  const garmentRejects = {}; // { garmentId: { total, byContext: { ctx: count }, byReason: { reason: count } } }

  rejectEntries.forEach(entry => {
    const ctx = entry.context ?? "any";
    const reason = entry.reason ?? "";
    (entry.garmentIds ?? []).forEach(gid => {
      if (!garmentRejects[gid]) {
        garmentRejects[gid] = { total: 0, byContext: {}, byReason: {} };
      }
      garmentRejects[gid].total++;
      garmentRejects[gid].byContext[ctx] = (garmentRejects[gid].byContext[ctx] ?? 0) + 1;
      if (reason) {
        garmentRejects[gid].byReason[reason] = (garmentRejects[gid].byReason[reason] ?? 0) + 1;
      }
    });
  });

  // Generate insights about systematic rejections
  const insights = [];
  Object.entries(garmentRejects).forEach(([gid, data]) => {
    if (data.total >= 3) {
      const topReason = Object.entries(data.byReason)
        .sort(([, a], [, b]) => b - a)[0];
      const topContext = Object.entries(data.byContext)
        .sort(([, a], [, b]) => b - a)[0];

      insights.push({
        garmentId: gid,
        totalRejections: data.total,
        primaryReason: topReason?.[0] ?? null,
        primaryReasonCount: topReason?.[1] ?? 0,
        primaryContext: topContext?.[0] ?? null,
        primaryContextCount: topContext?.[1] ?? 0,
      });
    }
  });

  /**
   * Get the rejection penalty for a garment in a given context.
   * @param {string} garmentId
   * @param {string} context — current outfit context (clinic, casual, etc.)
   * @returns {number} 0 to -0.35
   */
  function penaltyFor(garmentId, context = "any") {
    const data = garmentRejects[garmentId];
    if (!data) return 0;

    // Context-specific rejection count
    const ctxCount = data.byContext[context] ?? 0;
    const totalCount = data.total;

    // Use the higher of context-specific or total count
    const effectiveCount = Math.max(ctxCount, Math.floor(totalCount / 2));

    if (effectiveCount <= 1) return 0;

    // Check if same reason keeps recurring (systematic dislike)
    const maxReasonCount = Math.max(0, ...Object.values(data.byReason));
    const hasSystematicReason = maxReasonCount >= 3;

    if (hasSystematicReason) return -0.35;
    if (effectiveCount >= 3) return -0.25;
    return -0.10;
  }

  return { penaltyFor, insights, garmentRejects };
}

/**
 * Detect color combo rejections — pairs of colors that are consistently rejected together.
 *
 * @param {Array} rejectEntries
 * @param {Array} garments
 * @returns {Array<{ colors: [string, string], count: number }>}
 */
export function rejectedColorCombos(rejectEntries, garments) {
  const comboCounts = {};

  rejectEntries.forEach(entry => {
    const ids = entry.garmentIds ?? [];
    const colors = ids
      .map(id => garments.find(g => g.id === id)?.color?.toLowerCase())
      .filter(Boolean);

    // Generate pairs
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const pair = [colors[i], colors[j]].sort().join("|");
        comboCounts[pair] = (comboCounts[pair] ?? 0) + 1;
      }
    }
  });

  return Object.entries(comboCounts)
    .filter(([, count]) => count >= 2)
    .map(([pair, count]) => ({ colors: pair.split("|"), count }))
    .sort((a, b) => b.count - a.count);
}
