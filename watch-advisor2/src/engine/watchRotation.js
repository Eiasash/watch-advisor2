export function pickWatch(watches, history) {
  const recent = new Set(history.slice(-7).map(x => x.watchId));
  const options = watches.filter(w => !recent.has(w.id));
  if (!options.length) return watches[0];
  return options[0];
}
