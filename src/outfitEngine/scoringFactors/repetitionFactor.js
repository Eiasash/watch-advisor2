import { repetitionPenalty } from "../../domain/contextMemory.js";

/**
 * Repetition penalty — applies ONLY when diversity bonus isn't already penalising.
 *
 * Before this fix, both factors stacked: a garment worn 3× in a week got
 * -0.28 (repetition) + -0.36 (diversity) = -0.64 total — nuking good pieces.
 * Now: whichever penalty is stronger wins; they never compound.
 *
 * Returns -0.28 if worn in last 5 entries AND diversityBonus >= 0, else 0.
 */
export default function repetitionFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  // If diversity already penalises this garment, skip repetition to avoid compounding.
  if ((candidate.diversityBonus ?? 0) < 0) return 0;
  return repetitionPenalty(candidate.garment.id, context.history);
}
