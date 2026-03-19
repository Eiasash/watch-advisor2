import { garmentDaysIdle, rotationPressure } from "../../domain/rotationStats.js";

/** Garment rotation pressure — nudge idle pieces toward recommendation */
export default function rotationFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  const idle = garmentDaysIdle(candidate.garment.id, context.history);
  // v2 fix: weight raised 0.2 → 0.40 so rotation pressure meaningfully overrides
  // base score — previously too weak to surface idle garments over scoring favourites.
  return rotationPressure(idle) * 0.40;
}
