import { garmentDaysIdle, rotationPressure } from "../../domain/rotationStats.js";
import { getOverride } from "../../config/scoringOverrides.js";
import { categoryRotationMultiplier } from "../../config/scoringWeights.js";

/** Garment rotation pressure — nudge idle pieces toward recommendation.
 *  Damped per slot: shoes are rotation-neutral (×0), pants relieved (×0.4). */
export default function rotationFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  const mult = categoryRotationMultiplier(candidate.garment);
  if (mult === 0) return 0;
  const idle = garmentDaysIdle(candidate.garment.id, context.history);
  return rotationPressure(idle) * getOverride("rotationFactor", 0.40) * mult;
}
