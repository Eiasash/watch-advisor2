/**
 * Watch style → garment category mapping.
 * Drives the outfit generation based on watch type.
 */

export const watchStyles = {
  dress:          ["shirt", "slacks", "oxford shoes"],
  "dress-sport":  ["shirt", "pants", "shoes"],
  sport:          ["polo", "jeans", "sneakers"],
  "sport-elegant":["shirt", "pants", "shoes"],
  diver:          ["tshirt", "shorts", "sneakers"],
  field:          ["flannel", "chinos", "boots"],
  pilot:          ["shirt", "pants", "boots"],
};

/**
 * Map watch style keywords to canonical garment categories needed.
 */
export const STYLE_TO_SLOTS = {
  dress:          { shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
  "dress-sport":  { shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
  sport:          { shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
  "sport-elegant":{ shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
  diver:          { shirt: "shirt", pants: "pants", shoes: "shoes" },
  field:          { shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
  pilot:          { shirt: "shirt", pants: "pants", shoes: "shoes", jacket: "jacket" },
};

/**
 * Formality targets by watch style.
 */
export const STYLE_FORMALITY_TARGET = {
  dress:          8,
  "dress-sport":  7,
  "sport-elegant":6,
  sport:          5,
  diver:          4,
  field:          5,
  pilot:          5,
};
