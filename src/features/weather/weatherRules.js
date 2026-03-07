/**
 * Weather-based layering suggestions.
 */

export function weatherLayerSuggestion(weather) {
  const temp = weather.temperature;

  if (temp < 10) return "heavy-jacket";
  if (temp < 16) return "jacket";
  if (temp < 21) return "light-sweater";
  if (temp < 26) return "optional-layer";

  return "no-layer";
}

const LAYER_LABELS = {
  "heavy-jacket":   "heavy jacket recommended",
  "jacket":         "jacket recommended",
  "light-sweater":  "light sweater recommended",
  "optional-layer": "optional layer",
  "no-layer":       "no extra layer needed",
};

export function weatherDisplayText(weather) {
  if (!weather) return null;
  const suggestion = weatherLayerSuggestion(weather);
  return `${weather.temperature}°C — ${LAYER_LABELS[suggestion]}`;
}
