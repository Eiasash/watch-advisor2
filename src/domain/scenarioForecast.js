/**
 * scenarioForecast — build scoring contexts for future-date previews.
 *
 * Pure domain function. No React, Zustand, IDB, or Supabase.
 * The engine callable is passed in by the caller — never imported here.
 */

/**
 * Build a context object for tomorrow's outfit recommendation.
 *
 * @param {{ history, garments, watches, forecastTempC }} params
 * @returns {{ date, history, garments, watches, tempC }}
 */
export function buildTomorrowContext({ history, garments, watches, forecastTempC }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    date:     tomorrow.toISOString().slice(0, 10),
    history,
    garments,
    watches,
    tempC:    forecastTempC ?? null,
  };
}

/**
 * Run the outfit engine against a pre-built scenario context.
 *
 * The engine is injected to keep this module free of import side-effects.
 * Typical usage: forecastRecommendation(buildOutfit, context)
 *
 * @param {Function|null} engine — (watch, wardrobe, weather, history) → outfit
 * @param {{ date, history, garments, watches, tempC } | null} context
 * @returns {object|null}
 */
export function forecastRecommendation(engine, context) {
  if (!engine || !context) return null;
  return engine(context);
}
