/** Color match contribution — read from pre-computed candidate.colorScore */
export default function colorFactor(candidate) {
  return candidate.colorScore ?? 0;
}
