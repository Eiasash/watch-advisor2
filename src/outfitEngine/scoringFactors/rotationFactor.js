import { garmentDaysIdle, rotationPressure } from "../../domain/rotationStats.js";
import { getOverride } from "../../config/scoringOverrides.js";

/** Garment rotation pressure — nudge idle pieces toward recommendation */
export default function rotationFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  const idle = garmentDaysIdle(candidate.garment.id, context.history);
  return rotationPressure(idle) * getOverride("rotationFactor", 0.40);
}
