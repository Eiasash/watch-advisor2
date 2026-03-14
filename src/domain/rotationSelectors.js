/**
 * rotationSelectors — precomputed rotation stats keyed by watchId.
 *
 * buildRotationMap runs the per-watch calculations once and returns a plain
 * map so React components can look up stats in O(1) instead of filtering
 * history arrays on every render.
 *
 * Domain rule: no React, no Zustand, no side effects — pure data → data.
 */

import { daysIdle, wearCount, watchCPW } from "./rotationStats.js";

/**
 * Build a flat map of rotation stats indexed by watchId.
 * Intended to be wrapped in useMemo([watches, history]) by the consumer.
 *
 * @param {Array} watches — full watch collection
 * @param {Array} history — historyStore entries
 * @returns {Object} { [watchId]: { idle, wearCount, cpw } }
 */
export function buildRotationMap(watches, history) {
  const map = {};
  for (const w of watches) {
    map[w.id] = {
      idle:      daysIdle(w.id, history),
      wearCount: wearCount(w.id, history),
      cpw:       watchCPW(w, history),
    };
  }
  return map;
}
