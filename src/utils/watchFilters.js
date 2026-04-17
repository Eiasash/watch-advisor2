// Centralized watch status filters.
// A watch is "active" if it's not retired AND not pending (incoming).
// - retired: traded/sold — kept in data for history integrity
// - pending: acquired but not yet received — should not appear in rotation
export function isActiveWatch(w) {
  return !!w && !w.retired && !w.pending;
}

export function isSelectableWatch(w) {
  return isActiveWatch(w);
}

export function activeWatches(watches) {
  return (watches ?? []).filter(isActiveWatch);
}
