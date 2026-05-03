/**
 * useRecommendationEngine — encapsulates watch recommendation and tomorrow preview.
 *
 * buildOutfit is dynamically imported so the engine chunk is not required
 * for the initial paint — tomorrow preview loads after the UI is interactive.
 */

import { useState, useEffect } from "react";
import { scoreWatchForDay }     from "../engine/dayProfile.js";
import { buildTomorrowContext, forecastRecommendation } from "../domain/scenarioForecast.js";
import { buildOutfit } from "../outfitEngine/outfitBuilder.js";

const ACCESSORY_TYPES = new Set([
  "outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory",
]);

/**
 * @param {{ watches, garments, entries, weather }} params
 * @returns {{ tomorrowPreview: { watch, outfit } | null }}
 */
export function useRecommendationEngine({ watches, garments, entries, weather }) {
  const [tomorrowPreview, setTomorrowPreview] = useState(null);

  useEffect(() => {
    const wearable = garments.filter(g =>
      !ACCESSORY_TYPES.has(g.type) && !g.excludeFromWardrobe
    );
    if (!watches.length || !wearable.length) {
      setTomorrowPreview(null);
      return;
    }

    try {
      const ctx = buildTomorrowContext({
        history:      entries,
        garments:     wearable,
        watches,
        forecastTempC: weather?.tempC ?? null,
      });
      const bestWatch = watches
        .map(w => ({ watch: w, score: scoreWatchForDay(w, "smart-casual", entries) }))
        .sort((a, b) => b.score - a.score)[0]?.watch ?? watches[0];
      const outfit = forecastRecommendation(
        (c) => buildOutfit(bestWatch, c.garments, { tempC: c.tempC ?? 18 }, c.history, [], {}, {}, "smart-casual"),
        ctx
      );
      setTomorrowPreview(outfit ? { watch: bestWatch, outfit } : null);
    } catch {
      setTomorrowPreview(null);
    }
  }, [watches, garments, entries, weather]);

  return { tomorrowPreview };
}
