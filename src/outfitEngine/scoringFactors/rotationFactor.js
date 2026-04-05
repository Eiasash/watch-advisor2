import { garmentDaysIdle, rotationPressure } from "../../domain/rotationStats.js";
import { getOverride } from "../../config/scoringOverrides.js";

/** Garment rotation pressure — nudge idle pieces toward recommendation */
export default function rotationFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  const idle = garmentDaysIdle(candidate.garment.id, context.history);
  // Weight auto-tuned by auto-heal when watch stagnation detected (default 0.40, cap 0.60)
  const weight = getOverride("rotationFactor", 0.40);
  return rotationPressure(idle) * weight;
}
