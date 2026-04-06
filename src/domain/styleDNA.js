/**
 * styleDNA — derives personal style patterns from wear history.
 *
 * Pure domain function. Analyzes history + garments + watches to extract:
 * - Color palette preferences (worn vs available)
 * - Formality distribution (actual vs wardrobe capacity)
 * - Watch-outfit affinity (which watches pair with which garment types)
 * - Day-of-week patterns (what you reach for on clinic vs casual days)
 * - Rejection DNA (what you consistently reject and why)
 * - Comfort zone vs stretch picks
 */

/**
 * Analyze color preferences — which colors appear most in worn outfits
 * vs what's available in the wardrobe.
 *
 * @param {Array} history — historyStore entries
 * @param {Array} garments — all active garments
 * @returns {{ worn: Object, available: Object, overIndex: Array, underIndex: Array }}
 */
export function colorDNA(history, garments) {
  if (!Array.isArray(history)) return { worn: {}, available: {}, overIndex: [], underIndex: [] };
  const wornColorFreq = {};
  const availableColorFreq = {};

  // Count available colors
  garments.forEach(g => {
    const c = g.color?.toLowerCase() ?? "unknown";
    availableColorFreq[c] = (availableColorFreq[c] ?? 0) + 1;
  });

  // Count worn colors
  history.forEach(entry => {
    const ids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
    ids.forEach(id => {
      const g = garments.find(x => x.id === id);
      if (g) {
        const c = g.color?.toLowerCase() ?? "unknown";
        wornColorFreq[c] = (wornColorFreq[c] ?? 0) + 1;
      }
    });
  });

  // Calculate over/under-indexed colors
  const totalWorn = Object.values(wornColorFreq).reduce((a, b) => a + b, 0) || 1;
  const totalAvail = Object.values(availableColorFreq).reduce((a, b) => a + b, 0) || 1;

  const indexed = Object.keys(availableColorFreq).map(color => {
    const wornPct = ((wornColorFreq[color] ?? 0) / totalWorn) * 100;
    const availPct = (availableColorFreq[color] / totalAvail) * 100;
    const index = availPct > 0 ? +(wornPct / availPct).toFixed(2) : 0;
    return { color, wornCount: wornColorFreq[color] ?? 0, availCount: availableColorFreq[color], index };
  });

  return {
    worn: wornColorFreq,
    available: availableColorFreq,
    overIndex: indexed.filter(c => c.index > 1.3).sort((a, b) => b.index - a.index),
    underIndex: indexed.filter(c => c.index < 0.7 && c.availCount >= 2).sort((a, b) => a.index - b.index),
  };
}

/**
 * Formality distribution — where you actually dress on the formality spectrum.
 *
 * @param {Array} history
 * @param {Array} garments
 * @returns {{ distribution: Object, average: number, mode: number }}
 */
export function formalityDNA(history, garments) {
  if (!Array.isArray(history)) return { distribution: { "1-3": 0, "4-5": 0, "6-7": 0, "8-10": 0 }, average: 0, mode: "4-5" };
  const formalityBuckets = { "1-3": 0, "4-5": 0, "6-7": 0, "8-10": 0 };
  const formalityValues = [];

  history.forEach(entry => {
    const ids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
    const fVals = ids
      .map(id => garments.find(x => x.id === id)?.formality)
      .filter(f => f != null);
    if (fVals.length === 0) return;
    const avg = fVals.reduce((a, b) => a + b, 0) / fVals.length;
    formalityValues.push(avg);
    if (avg <= 3) formalityBuckets["1-3"]++;
    else if (avg <= 5) formalityBuckets["4-5"]++;
    else if (avg <= 7) formalityBuckets["6-7"]++;
    else formalityBuckets["8-10"]++;
  });

  const average = formalityValues.length
    ? +(formalityValues.reduce((a, b) => a + b, 0) / formalityValues.length).toFixed(1)
    : 0;

  // Mode bucket
  const mode = Object.entries(formalityBuckets)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "4-5";

  return { distribution: formalityBuckets, average, mode };
}

/**
 * Watch-outfit affinity — which watches you pair with which color families.
 *
 * @param {Array} history
 * @param {Array} garments
 * @param {Array} watches
 * @returns {Array<{ watchId, model, topColors: Array, avgFormality: number, wearCount: number }>}
 */
export function watchAffinityDNA(history, garments, watches) {
  if (!Array.isArray(history)) return [];
  const affinity = {};

  history.forEach(entry => {
    const wid = entry.watchId ?? entry.watch_id;
    if (!wid) return;
    if (!affinity[wid]) affinity[wid] = { colors: {}, formalitySum: 0, formalityCount: 0, count: 0 };
    affinity[wid].count++;

    const ids = entry.garmentIds ?? entry.payload?.garmentIds ?? [];
    ids.forEach(id => {
      const g = garments.find(x => x.id === id);
      if (!g) return;
      const c = g.color?.toLowerCase() ?? "unknown";
      affinity[wid].colors[c] = (affinity[wid].colors[c] ?? 0) + 1;
      if (g.formality != null) {
        affinity[wid].formalitySum += g.formality;
        affinity[wid].formalityCount++;
      }
    });
  });

  return Object.entries(affinity)
    .map(([watchId, data]) => {
      const watch = watches.find(w => w.id === watchId);
      const topColors = Object.entries(data.colors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([color, count]) => ({ color, count }));
      return {
        watchId,
        model: watch?.model ?? watchId,
        brand: watch?.brand ?? "",
        topColors,
        avgFormality: data.formalityCount ? +(data.formalitySum / data.formalityCount).toFixed(1) : null,
        wearCount: data.count,
      };
    })
    .filter(a => a.wearCount >= 2)
    .sort((a, b) => b.wearCount - a.wearCount);
}

/**
 * Context patterns — what contexts you actually use and how they differ.
 *
 * @param {Array} history
 * @returns {{ distribution: Object, topContext: string, total: number }}
 */
export function contextDNA(history) {
  if (!Array.isArray(history)) return { distribution: {}, topContext: "unset", total: 0 };
  const dist = {};
  history.forEach(entry => {
    const ctx = entry.context ?? entry.payload?.context ?? "unset";
    dist[ctx] = (dist[ctx] ?? 0) + 1;
  });

  const topContext = Object.entries(dist)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unset";

  return { distribution: dist, topContext, total: history.length };
}

/**
 * Comfort zone analysis — which garments you always pick vs never touch.
 *
 * @param {Array} history
 * @param {Array} garments
 * @returns {{ staples: Array, ignored: Array, comfortPct: number }}
 */
export function comfortZoneDNA(history, garments) {
  if (!Array.isArray(history)) return { staples: [], ignored: [], comfortPct: 0 };
  const freq = {};
  history.forEach(entry => {
    (entry.garmentIds ?? entry.payload?.garmentIds ?? []).forEach(id => {
      freq[id] = (freq[id] ?? 0) + 1;
    });
  });

  const sorted = garments
    .map(g => ({ ...g, wearCount: freq[g.id] ?? 0 }))
    .sort((a, b) => b.wearCount - a.wearCount);

  const staples = sorted.filter(g => g.wearCount >= 3).slice(0, 8);
  const ignored = sorted.filter(g => g.wearCount === 0);
  const comfortPct = history.length > 0
    ? Math.round((staples.reduce((a, g) => a + g.wearCount, 0) /
        Math.max(1, Object.values(freq).reduce((a, b) => a + b, 0))) * 100)
    : 0;

  return { staples, ignored, comfortPct };
}

/**
 * Full Style DNA report — all analyses combined.
 */
export function buildStyleDNA(history, garments, watches) {
  const safeHistory = Array.isArray(history) ? history : [];
  return {
    color: colorDNA(safeHistory, garments),
    formality: formalityDNA(safeHistory, garments),
    watchAffinity: watchAffinityDNA(safeHistory, garments, watches),
    context: contextDNA(safeHistory),
    comfortZone: comfortZoneDNA(safeHistory, garments),
    entryCount: safeHistory.length,
    garmentCount: garments.length,
  };
}
