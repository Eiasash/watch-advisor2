/**
 * Weather-based garment scoring rules.
 * Imported by src/outfitEngine/scoring.js.
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
