/**
 * useRecommendationEngine — encapsulates watch recommendation and tomorrow preview.
 *
 * Extracted from TodayPanel to separate recommendation logic from UI state.
 * No behavior change — identical logic to what was inline.
 */

import { useMemo } from "react";
import { buildOutfit }          from "../outfitEngine/outfitBuilder.js";
import { scoreWatchForDay }     from "../engine/dayProfile.js";
import { buildTomorrowContext, forecastRecommendation } from "../domain/scenarioForecast.js";

const ACCESSORY_TYPES = new Set([
  "outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory",
]);

/**
 * @param {{ watches, garments, entries, weather }} params
 * @returns {{ tomorrowPreview: { watch, outfit } | null }}
 */
export function useRecommendationEngine({ watches, garments, entries, weather }) {
  const tomorrowPreview = useMemo(() => {
    const wearable = garments.filter(g =>
      !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe
    );
    if (!watches.length || !wearable.length) return null;
    try {
      const ctx = buildTomorrowContext({
        history:      entries,
        garments:     wearable,
        watches,
        forecastTempC: weather?.tempC ?? null,
      });
      // Best watch for tomorrow via existing rotation scoring
      const bestWatch = watches
        .map(w => ({ watch: w, score: scoreWatchForDay(w, "smart-casual", entries) }))
        .sort((a, b) => b.score - a.score)[0]?.watch ?? watches[0];
      const outfit = forecastRecommendation(
        (c) => buildOutfit(bestWatch, c.garments, { tempC: c.tempC ?? 18 }, c.history, [], {}),
        ctx
      );
      return outfit ? { watch: bestWatch, outfit } : null;
    } catch { return null; }
  }, [watches, garments, entries, weather]);

  return { tomorrowPreview };
}
