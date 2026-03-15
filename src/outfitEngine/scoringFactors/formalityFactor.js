/** Formality match contribution — read from pre-computed candidate.formalityScore */
export default function formalityFactor(candidate) {
  return candidate.formalityScore ?? 0;
}
