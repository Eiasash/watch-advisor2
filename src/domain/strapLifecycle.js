/**
 * strapLifecycle — tracks strap wear count, age, and estimated lifespan.
 *
 * Derives from history entries that include strapId/strapLabel.
 * Estimates lifespan based on strap type:
 *   - Leather alligator: ~300 wears (2-3 years daily)
 *   - Leather calf: ~400 wears
 *   - Canvas/NATO: ~500 wears
 *   - Rubber: ~600 wears
 *   - Bracelet: infinite
 *
 * Returns per-strap: wearCount, firstWorn, lastWorn, estimatedLifespan,
 *   remainingWears, healthPct, replacementDate estimate.
 */

const LIFESPAN_BY_TYPE = {
  leather: 350,
  alligator: 280,
  canvas: 500,
  nato: 500,
  rubber: 600,
  bracelet: Infinity,
  default: 400,
};

/**
 * Estimate lifespan based on strap label/type.
 * @param {string} label — strap label like "Grey alligator", "Navy canvas #18"
 * @param {string} type — strap type from strapStore if available
 * @returns {number} estimated total wears
 */
function estimateLifespan(label = "", type = "") {
  const l = (label + " " + type).toLowerCase();
  if (l.includes("bracelet") || l.includes("steel") || l.includes("titanium")) return Infinity;
  if (l.includes("alligator") || l.includes("croc")) return LIFESPAN_BY_TYPE.alligator;
  if (l.includes("canvas")) return LIFESPAN_BY_TYPE.canvas;
  if (l.includes("nato")) return LIFESPAN_BY_TYPE.nato;
  if (l.includes("rubber") || l.includes("silicone")) return LIFESPAN_BY_TYPE.rubber;
  if (l.includes("leather") || l.includes("calf") || l.includes("suede")) return LIFESPAN_BY_TYPE.leather;
  return LIFESPAN_BY_TYPE.default;
}

/**
 * Build strap lifecycle data from history.
 *
 * @param {Array} history — historyStore entries (need strapId or strapLabel)
 * @param {Array} watches — watch collection with straps[] arrays
 * @returns {Array<{ strapId, strapLabel, watchId, watchModel, wearCount, firstWorn, lastWorn, lifespan, remaining, healthPct }>}
 */
export function buildStrapLifecycle(history, watches) {
  const strapWears = {}; // strapId → { count, dates[], watchId, label }

  history.forEach(entry => {
    const strapId = entry.strapId ?? entry.payload?.strapId;
    const strapLabel = entry.strapLabel ?? entry.payload?.strapLabel;
    const watchId = entry.watchId ?? entry.watch_id;
    const date = entry.date;

    if (!strapId && !strapLabel) return;
    const key = strapId ?? strapLabel;

    if (!strapWears[key]) {
      strapWears[key] = { id: strapId, label: strapLabel, watchId, dates: [] };
    }
    if (date) strapWears[key].dates.push(date);
  });

  return Object.entries(strapWears)
    .map(([key, data]) => {
      const watch = watches.find(w => w.id === data.watchId);
      const watchModel = watch?.model ?? data.watchId ?? "Unknown";

      // Find strap type from watch seed
      const strapObj = watch?.straps?.find(s => s.id === data.id || s.label === data.label);
      const strapType = strapObj?.type ?? "";

      const sortedDates = data.dates.sort();
      const firstWorn = sortedDates[0] ?? null;
      const lastWorn = sortedDates[sortedDates.length - 1] ?? null;
      const wearCount = data.dates.length;

      const lifespan = estimateLifespan(data.label ?? "", strapType);
      const remaining = lifespan === Infinity ? Infinity : Math.max(0, lifespan - wearCount);
      const healthPct = lifespan === Infinity ? 100 : Math.max(0, Math.round((1 - wearCount / lifespan) * 100));

      // Estimate replacement date based on current wear rate
      let replacementDate = null;
      if (isFinite(remaining) && remaining > 0 && sortedDates.length >= 2) {
        const firstMs = new Date(firstWorn).getTime();
        const lastMs = new Date(lastWorn).getTime();
        const daySpan = Math.max(1, (lastMs - firstMs) / 86400000);
        const wearRate = wearCount / daySpan; // wears per day
        if (wearRate > 0) {
          const daysUntilReplace = remaining / wearRate;
          const replaceMs = Date.now() + daysUntilReplace * 86400000;
          replacementDate = new Date(replaceMs).toISOString().slice(0, 10);
        }
      }

      return {
        strapId: data.id ?? key,
        strapLabel: data.label ?? key,
        watchId: data.watchId,
        watchModel,
        wearCount,
        firstWorn,
        lastWorn,
        lifespan,
        remaining,
        healthPct,
        replacementDate,
        strapType: strapType || (lifespan === Infinity ? "bracelet" : "leather"),
      };
    })
    .filter(s => s.wearCount > 0)
    .sort((a, b) => a.healthPct - b.healthPct); // worst health first
}

/**
 * Get straps that need attention (health < 30% or < 50 wears remaining).
 */
export function strapsNeedingAttention(lifecycle) {
  return lifecycle.filter(s =>
    isFinite(s.remaining) && (s.healthPct < 30 || s.remaining < 50)
  );
}
