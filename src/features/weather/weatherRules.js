/**
 * Weather layer suggestion rules.
 * Maps temperature to recommended layer type.
 */

export function weatherLayerSuggestion(weather) {
  const temp = weather?.temperature ?? 22;
  if (temp < 10) return "heavy-jacket";
  if (temp < 16) return "jacket";
  if (temp < 21) return "light-sweater";
  if (temp < 26) return "optional-layer";
  return "no-layer";
}

const LAYER_LABELS = {
  "heavy-jacket": "heavy jacket recommended",
  "jacket": "jacket recommended",
  "light-sweater": "light sweater recommended",
  "optional-layer": "optional layer",
  "no-layer": "no extra layer needed",
};

export function weatherDisplayText(weather) {
  if (!weather) return null;
  const layer = weatherLayerSuggestion(weather);
  return `${weather.temperature}\u00B0C \u2014 ${LAYER_LABELS[layer]}`;
}
