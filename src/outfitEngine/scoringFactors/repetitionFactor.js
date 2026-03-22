import { repetitionPenalty } from "../../domain/contextMemory.js";

/** Binary repetition penalty — -0.28 if worn in last 5 entries, else 0 */
export default function repetitionFactor(candidate, context) {
  if (!candidate.garment?.id) return 0;
  return repetitionPenalty(candidate.garment.id, context.history);
}
