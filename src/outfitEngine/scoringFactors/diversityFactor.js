/** Diversity bonus — read from pre-computed candidate.diversityBonus */
export default function diversityFactor(candidate) {
  return candidate.diversityBonus ?? 0;
}
