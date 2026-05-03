/**
 * tradeSimulator — "What if I trade X for Y?"
 * Analyzes impact on collection diversity, dial coverage, strap count, and rotation.
 *
 * Usage:
 *   const result = simulateTrade({
 *     collection: WATCH_COLLECTION,
 *     history: [...],
 *     tradeOut: ["gmt", "reverso"],
 *     tradeIn: { id: "laureato_grey", brand: "GP", model: "Laureato Infinite Grey", dial: "grey", style: "sport-elegant", straps: 1 },
 *     cashDelta: -15000, // negative = you pay, positive = you receive
 *   });
 */

// Dial color families for diversity scoring
const COLOR_FAMILIES = {
  black: ["black"],
  blue: ["blue", "navy"],
  grey: ["grey", "slate", "meteorite"],
  green: ["green", "teal"],
  white: ["white", "silver", "cream", "ivory"],
  red: ["red", "burgundy", "wine"],
  gold: ["gold", "champagne", "rose gold"],
  purple: ["purple", "grape"],
  turquoise: ["turquoise"],
};

function getDialFamily(dial) {
  if (!dial) return "unknown";
  const d = dial.toLowerCase();
  for (const [family, members] of Object.entries(COLOR_FAMILIES)) {
    if (members.some(m => d.includes(m))) return family;
  }
  return "other";
}

/**
 * @param {object} opts
 * @param {Array} opts.collection - current WATCH_COLLECTION
 * @param {Array} opts.history - wear history entries
 * @param {string[]} opts.tradeOut - watch IDs to trade away
 * @param {object|object[]} opts.tradeIn - new watch(es) to acquire
 * @param {number} [opts.cashDelta] - cash paid (negative) or received (positive)
 * @returns {object} impact analysis
 */
import { isActiveWatch } from "../utils/watchFilters.js";

export function simulateTrade({ collection, history, tradeOut = [], tradeIn, cashDelta = 0 }) {
  const active = collection.filter(isActiveWatch);
  const incoming = Array.isArray(tradeIn) ? tradeIn : tradeIn ? [tradeIn] : [];

  // Current state
  const currentDials = active.map(w => getDialFamily(w.dial));
  const currentFamilies = new Set(currentDials);
  const currentGenuine = active.filter(w => !w.replica).length;
  const currentReplica = active.filter(w => w.replica).length;
  const currentStraps = active.reduce((sum, w) => sum + (w.straps?.length ?? 0), 0);

  // After trade state
  const afterCollection = active.filter(w => !tradeOut.includes(w.id));
  const afterWithNew = [...afterCollection, ...incoming];
  const afterDials = afterWithNew.map(w => getDialFamily(w.dial));
  const afterFamilies = new Set(afterDials);
  const afterGenuine = afterWithNew.filter(w => !w.replica).length;
  const afterReplica = afterWithNew.filter(w => w.replica).length;
  const afterStraps = afterWithNew.reduce((sum, w) => sum + (w.straps?.length ?? 0), 0);

  // Lost dial families
  const lostFamilies = [...currentFamilies].filter(f => !afterFamilies.has(f));
  const gainedFamilies = [...afterFamilies].filter(f => !currentFamilies.has(f));

  // Wear impact — how often were the traded-out watches worn?
  const tradeOutWears = {};
  for (const id of tradeOut) {
    tradeOutWears[id] = (history ?? []).filter(h => h.watchId === id).length;
  }
  const totalLostWears = Object.values(tradeOutWears).reduce((a, b) => a + b, 0);

  // Rotation impact
  const currentSize = active.length;
  const afterSize = afterWithNew.length;
  const rotationChange = afterSize - currentSize;

  return {
    before: {
      count: currentSize,
      genuine: currentGenuine,
      replica: currentReplica,
      dialFamilies: [...currentFamilies],
      strapCount: currentStraps,
    },
    after: {
      count: afterSize,
      genuine: afterGenuine,
      replica: afterReplica,
      dialFamilies: [...afterFamilies],
      strapCount: afterStraps,
    },
    impact: {
      sizeChange: rotationChange,
      dialFamiliesLost: lostFamilies,
      dialFamiliesGained: gainedFamilies,
      strapChange: afterStraps - currentStraps,
      wearsLost: tradeOutWears,
      totalWearsLost: totalLostWears,
      cashDelta,
    },
    verdict: generateVerdict({ lostFamilies, gainedFamilies, rotationChange, totalLostWears, cashDelta }),
  };
}

function generateVerdict({ lostFamilies, gainedFamilies, rotationChange, totalLostWears, cashDelta }) {
  const points = [];

  if (gainedFamilies.length > lostFamilies.length) {
    points.push("✅ Gains more dial diversity than it loses");
  } else if (lostFamilies.length > gainedFamilies.length) {
    points.push("⚠️ Loses dial diversity — " + lostFamilies.join(", ") + " family gone");
  }

  if (rotationChange < 0) {
    points.push("✅ Tighter collection — fewer pieces, better rotation");
  } else if (rotationChange > 0) {
    points.push("⚠️ Collection grows — rotation pressure increases");
  }

  if (totalLostWears === 0) {
    points.push("✅ Trading away unworn pieces — no rotation loss");
  } else if (totalLostWears > 5) {
    points.push(`⚠️ Losing ${totalLostWears} logged wears — these were active rotation pieces`);
  }

  if (cashDelta > 0) {
    points.push(`✅ Cash positive: +₪${cashDelta.toLocaleString()}`);
  } else if (cashDelta < -20000) {
    points.push(`⚠️ Significant cash outlay: ₪${Math.abs(cashDelta).toLocaleString()}`);
  }

  return points;
}
