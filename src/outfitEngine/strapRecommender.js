/**
 * Strap recommender — given a watch and an outfit, recommend the best strap.
 *
 * Scores each strap against:
 *   1. Shoe color match (mandatory strap-shoe rule)
 *   2. Outfit color palette affinity (e.g. olive strap + olive jacket)
 *   3. Context formality fit (leather for formal, canvas for casual)
 *   4. Watch dial color harmony
 *
 * Returns: { recommended, reason, alternatives }
 */

import { strapShoeScore } from "./scoring.js";
import { buildStrapLifecycle } from "../domain/strapLifecycle.js";

const EXEMPT_TYPES = new Set(["bracelet", "integrated"]);
const FORMAL_CONTEXTS = new Set(["clinic", "formal", "shift"]);

const COLOR_FAMILIES = {
  earth:    ["brown", "tan", "cognac", "camel", "khaki", "beige", "stone", "mink", "rustic"],
  olive:    ["olive", "sage", "green", "dark green", "military"],
  navy:     ["navy", "dark blue"],
  black:    ["black"],
  grey:     ["grey", "slate", "charcoal"],
  teal:     ["teal", "turquoise"],
  cream:    ["cream", "ecru", "ivory", "white", "off-white"],
  burgundy: ["burgundy", "wine", "maroon"],
};

function getColorFamily(color) {
  if (!color) return null;
  const c = color.toLowerCase();
  for (const [family, members] of Object.entries(COLOR_FAMILIES)) {
    if (members.some(m => c.includes(m))) return family;
  }
  return null;
}

/** Score how well a strap color harmonizes with the outfit palette */
function outfitPaletteScore(strap, outfit) {
  if (!strap || EXEMPT_TYPES.has((strap.type ?? "").toLowerCase())) return 0;
  const strapFamily = getColorFamily(strap.color);
  if (!strapFamily) return 0;

  let affinity = 0;
  const outfitSlots = [outfit.jacket, outfit.sweater, outfit.layer, outfit.pants, outfit.shirt];
  for (const garment of outfitSlots) {
    if (!garment?.color) continue;
    const gFamily = getColorFamily(garment.color);
    if (gFamily === strapFamily) {
      affinity += 0.15;
    } else if (
      (strapFamily === "olive" && gFamily === "earth") ||
      (strapFamily === "earth" && gFamily === "olive") ||
      (strapFamily === "navy" && gFamily === "cream") ||
      (strapFamily === "cream" && gFamily === "navy") ||
      (strapFamily === "teal" && gFamily === "cream") ||
      (strapFamily === "black" && gFamily === "grey") ||
      (strapFamily === "grey" && gFamily === "black") ||
      (strapFamily === "burgundy" && gFamily === "cream") ||
      (strapFamily === "earth" && gFamily === "cream")
    ) {
      affinity += 0.08;
    }
  }
  return Math.min(0.25, affinity);
}

function scoreStrapForOutfit(strap, outfit, context, watch, weather) {
  if (!strap) return 0;
  const strapType = (strap.type ?? "").toLowerCase();

  if (EXEMPT_TYPES.has(strapType)) {
    // Weather bonus: bracelets get extra score in rain/wet conditions
    const rainBonus = (weather?.precipMm ?? 0) > 1 ? 0.15 : 0;
    return 0.70 + rainBonus;
  }

  const shoes = outfit?.shoes;
  const fakeWatch = { strap: (strap.label ?? strap.color ?? "").toLowerCase() };
  const shoeScore = shoes ? strapShoeScore(fakeWatch, shoes, context) : 0.5;

  // Hard fail: strap-shoe color violation
  if (shoeScore === 0) return 0;

  let contextBonus = 0;
  if (FORMAL_CONTEXTS.has(context)) {
    if (strapType === "leather") contextBonus = 0.08;
    else if (["canvas", "nato", "rubber"].includes(strapType)) contextBonus = -0.15;
  } else if (context === "casual" || context === "riviera") {
    if (["nato", "rubber", "canvas"].includes(strapType)) contextBonus = 0.08;
  }

  // Weather-driven strap adjustments
  let weatherBonus = 0;
  if (weather) {
    const temp = weather.tempC ?? 20;
    const rain = weather.precipMm ?? 0;
    // Hot weather (>28°C): NATO/rubber preferred — lighter, breathable
    if (temp > 28 && ["nato", "rubber", "canvas"].includes(strapType)) weatherBonus = 0.10;
    // Rain: leather penalized (water damage risk)
    if (rain > 1 && strapType === "leather") weatherBonus = -0.10;
    // Rain: rubber/nato bonus
    if (rain > 1 && ["nato", "rubber"].includes(strapType)) weatherBonus = 0.10;
  }

  // Poor-fit flag on strap (e.g. Pasha bracelet)
  if (strap.poorFit) return Math.max(0, shoeScore * 0.5 + contextBonus);

  const paletteBonus = outfitPaletteScore(strap, outfit);

  let dialBonus = 0;
  if (watch?.dial) {
    const dialFamily = getColorFamily(watch.dial);
    const strapFamily = getColorFamily(strap.color);
    if (dialFamily && strapFamily && dialFamily === strapFamily) dialBonus = 0.08;
  }

  return Math.min(1.0, shoeScore + contextBonus + paletteBonus + dialBonus + weatherBonus);
}

// ── Rotation + strap-health signals (gentle, tie-breaking) ──────────────────
// Generated bundles spread wear across a watch's straps and ease off straps
// nearing end of life — without overriding color/context fit and WITHOUT ever
// touching shoe selection. Deltas are small vs the ~0–1 base score. Bracelets /
// integrated are infinite-life and are never health-penalised.
const ROTATION_RECENCY_W = 0.18; // worn today -> -0.18, fading to 0 over 30 days
const ROTATION_FREQ_W    = 0.07; // dominant strap in rotation -> up to -0.07
const HEALTH_W           = 0.15; // critically low health (<30%) -> up to -0.15

function _strapWearStats(watch, history) {
  const ids = new Set((watch?.straps ?? []).map(s => s.id));
  const byId = {};
  let totalWears = 0;
  (Array.isArray(history) ? history : []).forEach(e => {
    const sid = e.strapId ?? e.payload?.strapId;
    if (!sid || !ids.has(sid)) return;
    const date = e.date ?? e.payload?.date;
    if (!byId[sid]) byId[sid] = { count: 0, lastWorn: null };
    byId[sid].count++;
    totalWears++;
    if (date && (!byId[sid].lastWorn || date > byId[sid].lastWorn)) byId[sid].lastWorn = date;
  });
  const healthById = {};
  try {
    for (const s of buildStrapLifecycle(history, [watch])) healthById[s.strapId] = s.healthPct;
  } catch { /* health is best-effort */ }
  return { byId, totalWears, healthById };
}

// Recency + frequency pressure -> deprioritise the just-worn / over-worn strap.
function _rotationPenalty(strapId, stats) {
  const w = stats.byId[strapId];
  if (!w || !w.lastWorn) return 0; // never worn -> rotation-favoured, no penalty
  const days = (Date.now() - new Date(w.lastWorn).getTime()) / 86400000;
  const recency = Math.max(0, 1 - days / 30);
  const share = stats.totalWears > 0 ? Math.min(1, w.count / stats.totalWears) : 0;
  return ROTATION_RECENCY_W * recency + ROTATION_FREQ_W * share;
}

// Finite-life straps only: nudge away from a strap that is nearly spent.
function _healthPenalty(healthPct) {
  if (!isFinite(healthPct) || healthPct >= 30) return 0; // healthy or bracelet (Inf -> 100)
  return HEALTH_W * (1 - healthPct / 30);
}

/**
 * @param {object} watch    - Watch with .straps[]
 * @param {object} outfit   - Built outfit { shoes, shirt, pants, jacket, sweater, layer }
 * @param {string} context  - e.g. "clinic", "smart-casual"
 * @param {object} weather  - Optional weather context
 * @param {Array}  history  - Optional wear history (enables strap rotation + health)
 * @returns {{ recommended, reason, alternatives } | null}
 */
export function recommendStrap(watch, outfit, context, weather, history = []) {
  const straps = watch?.straps;
  if (!straps || straps.length <= 1) return null;

  const shoes = outfit?.shoes;
  const stats = _strapWearStats(watch, history);

  const scored = straps.map(s => {
    const healthPct = stats.healthById[s.id] ?? 100;
    const base = scoreStrapForOutfit(s, outfit, context, watch, weather);
    // Preserve hard shoe-fail (0) exactly — penalties never resurrect a failed strap.
    const score = base === 0
      ? 0
      : Math.max(0.02, base - _rotationPenalty(s.id, stats) - _healthPenalty(healthPct));
    return { ...s, score, healthPct };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) return null;

  let reason;
  const shoeColor = (shoes?.color ?? "").toLowerCase();
  const strapType = (best.type ?? "").toLowerCase();
  const strapFamily = getColorFamily(best.color);

  if (EXEMPT_TYPES.has(strapType)) {
    reason = "Bracelet is the versatile default — works with any shoe.";
  } else {
    const parts = [];
    if (shoeColor && (best.color ?? "").toLowerCase().includes("black") && shoeColor.includes("black")) {
      parts.push("matches your black shoes");
    } else if (shoeColor && ["brown", "tan", "cognac"].some(c => (best.color ?? "").toLowerCase().includes(c))) {
      parts.push(`coordinates with your ${shoeColor} shoes`);
    }
    const outfitSlots = [outfit?.jacket, outfit?.sweater, outfit?.pants].filter(g => g?.color);
    const matchingSlot = outfitSlots.find(g => getColorFamily(g.color) === strapFamily);
    if (matchingSlot) {
      parts.push(`echoes the ${matchingSlot.color} ${(matchingSlot.type ?? "").replace("pants", "trousers")}`);
    }
    if (watch?.dial && getColorFamily(watch.dial) === strapFamily) {
      parts.push(`harmonizes with the ${watch.dial} dial`);
    }
    reason = parts.length > 0
      ? `${best.label} — ${parts.join(", ")}.`
      : `${best.label} scores highest for ${context ?? "smart-casual"} context.`;
  }

  if (isFinite(best.healthPct) && best.healthPct < 30) {
    reason += ` (strap health ~${best.healthPct}% — rotate/replace soon)`;
  }

  return {
    recommended: { id: best.id, label: best.label, color: best.color, score: best.score, healthPct: best.healthPct },
    reason,
    alternatives: scored.slice(1, 3).filter(s => s.score > 0).map(s => ({
      id: s.id, label: s.label, color: s.color, score: s.score, healthPct: s.healthPct,
    })),
  };
}
