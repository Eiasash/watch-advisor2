/**
 * Weather-based garment scoring rules.
 * Imported by src/outfitEngine/scoring.js.
 *
 * Also exports UI layer suggestion helpers (weatherLayerSuggestion,
 * weatherDisplayText) — previously split across src/features/weather/weatherRules.js,
 * now consolidated here as the single source of truth for all weather-related logic.
 *
 * tempC thresholds → score for layer garments (jacket / sweater / coat).
 * Non-layer garments always return NEUTRAL_SCORE.
 */

export const NEUTRAL_SCORE = 0.5; // returned for non-layer garments or missing weather

// Layer types that are evaluated against temperature
export const LAYER_TYPES = new Set(["jacket", "sweater", "coat", "layer", "outerwear"]);

// Ordered temp breakpoints: [maxTemp (exclusive), score]
// Evaluated top-to-bottom — first match wins.
export const LAYER_TEMP_BRACKETS = [
  { below: 10, score: 1.0 },
  { below: 16, score: 0.8 },
  { below: 22, score: 0.5 },
  { below: Infinity, score: 0.1 }, // too warm for a layer
];

// ── UI layer suggestion helpers ───────────────────────────────────────────────
// These use finer-grained display thresholds (21°C / 26°C) vs the scoring
// brackets above (22°C) to give the user more actionable guidance.
// These functions drive the weather display in UI components; they do NOT
// affect outfit scoring.

const LAYER_LABELS = {
  "heavy-jacket": "heavy jacket recommended",
  "jacket":       "jacket recommended",
  "light-sweater":"light sweater recommended",
  "optional-layer":"optional layer",
  "no-layer":     "no extra layer needed",
};

/**
 * Maps current temperature to a recommended layer type for display.
 * Uses weather.temperature (UI format, °C).
 */
export function weatherLayerSuggestion(weather) {
  const temp = weather?.temperature ?? 22;
  if (temp < 10) return "heavy-jacket";
  if (temp < 16) return "jacket";
  if (temp < 21) return "light-sweater";
  if (temp < 26) return "optional-layer";
  return "no-layer";
}

/**
 * Returns a human-readable weather + layer suggestion string.
 */
export function weatherDisplayText(weather) {
  if (!weather) return null;
  const layer = weatherLayerSuggestion(weather);
  return `${weather.temperature}\u00B0C \u2014 ${LAYER_LABELS[layer]}`;
}
