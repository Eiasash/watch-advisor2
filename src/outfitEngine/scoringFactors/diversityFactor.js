import { categoryRotationMultiplier } from "../../config/scoringWeights.js";

/** Diversity bonus — pre-computed candidate.diversityBonus, damped per slot
 *  (shoes ×0 → rotation-neutral, pants ×0.4 → relieved). */
export default function diversityFactor(candidate) {
  const bonus = candidate.diversityBonus ?? 0;
  if (bonus === 0) return 0;
  const mult = categoryRotationMultiplier(candidate.garment);
  return mult === 0 ? 0 : bonus * mult;
}
