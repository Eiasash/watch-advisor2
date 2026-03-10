/**
 * Watch-driven outfit builder.
 *
 * Algorithm:
 * 1. Read selected watch
 * 2. Determine style
 * 3. Filter garments by required categories
 * 4. Score garments
 * 5. Pick highest-scoring items per slot
 */

import { STYLE_TO_SLOTS } from "./watchStyles.js";
import { scoreGarment, pantsShoeHarmony, pickBelt, strapShoeScore } from "./scoring.js";
import { useRejectStore } from "../stores/rejectStore.js";
import { useStrapStore } from "../stores/strapStore.js";

/**
 * Generate the best outfit around a watch.
 *
 * @param {object} watch - Selected watch
 * @param {Array} wardrobe - All garments
 * @param {object} weather - { tempC: number }
 * @param {Array} history - Recent outfit history
 * @returns {object} { shirt, pants, shoes, jacket }
 */
const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

// Subtype keywords for sweater differentiation.
// Pullovers layer under zip-ups; two pullovers stacked = structural failure.
const OVER_LAYER_KEYWORDS = ["zip", "cardigan", "hoodie", "vest", "gilet"];

function _isPulloverType(name) {
  if (!name) return true; // default: assume pullover (safer — prevents unknown stacking)
  const n = name.toLowerCase();
  // Explicit over-layer keywords → NOT a pullover
  if (OVER_LAYER_KEYWORDS.some(k => n.includes(k))) return false;
  // Everything else (cable knit, crewneck, waffle, or generic "sweater") = pullover
  return true;
}

// Casual-coded jackets that should never appear in clinic/formal contexts.
const CASUAL_JACKET_KEYWORDS = ["bomber", "hoodie", "sweatshirt", "jogger", "fleece", "windbreaker", "anorak", "parka"];

function _isCasualJacket(name) {
  if (!name) return false;
  return CASUAL_JACKET_KEYWORDS.some(k => name.includes(k));
}

export function buildOutfit(watch, wardrobe, weather = {}, history = [], garmentIds = [], pinnedSlots = {}, excludedPerSlot = {}, context = null) {
  if (!watch) return { shirt: null, pants: null, shoes: null, jacket: null, sweater: null, layer: null, belt: null };

  // Inject active strap label so strapShoeScore uses the real strap being worn today.
  // Fallback chain: strapStore override → watch.straps[0].label → constructed string → watch.strap.
  // Without this, single-strap watches like the Reverso ("leather") lose their
  // actual strap color ("Navy alligator") and strap-shoe scoring gets garbage input.
  const activeStrapObj = useStrapStore.getState().getActiveStrapObj?.(watch.id);
  let resolvedStrap = watch.strap;
  if (activeStrapObj) {
    resolvedStrap = activeStrapObj.label ?? activeStrapObj.color ?? watch.strap;
  } else if (watch.straps?.[0]) {
    const s0 = watch.straps[0];
    // Prefer full label ("Navy alligator"); else construct "color type" ("brown leather")
    resolvedStrap = s0.label ?? (s0.color && s0.type ? `${s0.color} ${s0.type}` : s0.color ?? watch.strap);
  }
  const watchWithStrap = { ...watch, strap: resolvedStrap };

  // ── Dual-dial resolution (Reverso Duoface) — MUST run before scoring ──────
  // Determines which dial face to score against. Affects colorMatchScore for ALL garments.
  // Context-driven: clinic/formal → dark outfit likely → white dial (contrast).
  // Casual/riviera → light outfit likely → navy dial (depth).
  // Smart-casual → scan wearable garments for dominant color temperature.
  let _dualDialRec = null;
  if (watch.dualDial) {
    const formalCtxs = new Set(["formal","clinic","hospital-smart-casual","shift"]);
    const casualCtxs = new Set(["casual","riviera"]);
    let useSideB = false; // sideB = white

    if (context && formalCtxs.has(context)) {
      useSideB = true; // formal contexts → dark clothes → white dial pops
    } else if (context && casualCtxs.has(context)) {
      useSideB = false; // casual → lighter clothes → navy dial adds depth
    } else {
      // Smart-casual or unknown: scan wardrobe for dark/light balance
      const darkSet = new Set(["black","navy","charcoal","dark brown","indigo","slate"]);
      const wearableColors = wardrobe
        .filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe)
        .filter(g => ["shirt","sweater","pants"].includes(g.type ?? g.category))
        .map(g => (g.color ?? "").toLowerCase());
      const darkPct = wearableColors.filter(c => darkSet.has(c)).length / (wearableColors.length || 1);
      useSideB = darkPct > 0.4;
    }

    if (useSideB) {
      watchWithStrap.dial = watch.dualDial.sideB; // "white"
      _dualDialRec = { side: "B", dial: watch.dualDial.sideB, label: watch.dualDial.sideB_label };
    } else {
      watchWithStrap.dial = watch.dualDial.sideA; // "navy"
      _dualDialRec = { side: "A", dial: watch.dualDial.sideA, label: watch.dualDial.sideA_label };
    }
  }

  // Strip accessories, outfit photos and excluded items from outfit consideration
  const wearable = wardrobe.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe);

  // Formality anchor: if slots are pinned by the user, score other slots to complement them
  const pinnedList = Object.values(pinnedSlots).filter(Boolean);
  const outfitFormality = pinnedList.length > 0
    ? Math.round(pinnedList.reduce((s, g) => s + (g.formality ?? 5), 0) / pinnedList.length)
    : null;

  const slots = STYLE_TO_SLOTS[watch.style] ?? STYLE_TO_SLOTS["sport-elegant"];
  const outfit = {};

  for (const [slotName, category] of Object.entries(slots)) {
    // If this slot was manually pinned by the user, use it directly
    if (pinnedSlots[slotName]) {
      outfit[slotName] = pinnedSlots[slotName];
      continue;
    }
    const type = category; // slot name matches category
    const candidates = wearable.filter(g => {
      const gType = g.type ?? g.category;
      // shirt slot: only actual shirts (sweaters go to sweater layer)
      if (type === "shirt") return gType === "shirt" && !excludedPerSlot[slotName]?.has(g.id);
      if (excludedPerSlot[slotName]?.has(g.id)) return false;
      return gType === type;
    });

    if (!candidates.length) {
      outfit[slotName] = null;
      continue;
    }

    // Score and sort — with rejection penalty
    const rejectState = useRejectStore.getState();
    const scored = candidates.map(g => {
      let score = scoreGarment(watchWithStrap, g, weather, outfitFormality, context) + diversityBonus(g, history);
      // Apply -0.3 penalty if this watch+garment combo was recently rejected
      if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
      return { garment: g, score };
    });
    scored.sort((a, b) => b.score - a.score);

    outfit[slotName] = scored[0].garment;
  }

  // ── Multilayer logic ────────────────────────────────────────────────────────
  // sweater: primary mid-layer (temp < 22°C)
  // layer:   second mid-layer  (temp < 12°C) — must be a DIFFERENT subtype
  //          e.g. if sweater = crewneck, layer = zip/cardigan/hoodie (not another crewneck)
  outfit.sweater = null;
  outfit.layer   = null;

  {
    const temp = weather?.tempC ?? 22;
    if (temp < 22) {
      const rejectState = useRejectStore.getState();
      const isFormalCtx = context === "formal" || context === "clinic"
        || context === "hospital-smart-casual" || context === "shift";
      const sweaters = wearable.filter(g => {
        if ((g.type ?? g.category) !== "sweater") return false;
        // In formal/clinic: exclude casual-coded sweaters (hoodies, jogger pieces)
        if (isFormalCtx) {
          const n = (g.name ?? "").toLowerCase();
          if (n.includes("hoodie") || n.includes("jogger") || n.includes("sweatshirt")) return false;
        }
        return true;
      });
      if (sweaters.length) {
        const scored = sweaters.map(g => {
          let score = scoreGarment(watchWithStrap, g, weather, outfitFormality, context) + diversityBonus(g, history);
          if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
          return { garment: g, score };
        });
        scored.sort((a, b) => b.score - a.score);

        // Color dedup: skip sweaters that match shirt color
        const shirtColor = (outfit.shirt?.color ?? "").toLowerCase();
        const bestSweater = scored.find(s =>
          s.score > 0 && (s.garment.color ?? "").toLowerCase() !== shirtColor
        ) ?? scored[0];
        outfit.sweater = pinnedSlots.sweater ?? (bestSweater?.score > 0 ? bestSweater.garment : null);

        // Second layer when cold enough — MUST be a different subtype than primary sweater.
        // Pullover subtypes (cable knit, crewneck, waffle) must not layer on each other.
        // Only zip-ups, cardigans, hoodies, vests qualify as layers over a pullover.
        if (temp < 12 && sweaters.length >= 2 && outfit.sweater) {
          // Pinned layer always wins — user override bypasses subtype guard
          if (pinnedSlots.layer) {
            outfit.layer = pinnedSlots.layer;
          } else {
            const sweaterColor = (outfit.sweater.color ?? "").toLowerCase();
            const primaryName = (outfit.sweater.name ?? "").toLowerCase();
            const isPrimaryPullover = _isPulloverType(primaryName);

            const secondBest = scored.find(s => {
              if (s.garment.id === outfit.sweater.id) return false;
              if (s.score <= 0) return false;
              const c = (s.garment.color ?? "").toLowerCase();
              if (c === sweaterColor || c === shirtColor) return false;
              // Subtype guard: if primary is pullover, layer must be zip/cardigan/hoodie
              const layerName = (s.garment.name ?? "").toLowerCase();
              if (isPrimaryPullover && _isPulloverType(layerName)) return false;
              return true;
            });
            if (secondBest) outfit.layer = secondBest.garment;
          }
        }
      }
    }
  }

  // Weather-based jacket recommendation — score and pick best, not just first.
  // In clinic/formal contexts, exclude casual-coded jackets (bomber, hoodie, jogger).
  if (weather?.tempC != null && !outfit.jacket) {
    const temp = weather.tempC;
    if (temp < 22) {
      const rejectState = useRejectStore.getState();
      const isFormalCtx = context === "formal" || context === "clinic"
        || context === "hospital-smart-casual" || context === "shift";
      const jackets = wearable.filter(g => {
        if ((g.type ?? g.category) !== "jacket") return false;
        // In formal/clinic: exclude casual-coded jackets by name
        if (isFormalCtx) {
          const n = (g.name ?? "").toLowerCase();
          if (_isCasualJacket(n)) return false;
        }
        return true;
      });
      if (jackets.length) {
        const scored = jackets.map(g => {
          let score = scoreGarment(watchWithStrap, g, weather, null, context) + diversityBonus(g, history);
          if (rejectState.isRecentlyRejected(watch.id, [g.id])) score -= 0.3;
          return { garment: g, score };
        });
        scored.sort((a, b) => b.score - a.score);
        // Only pick if it passes context formality floor
        if (scored[0]?.score > 0) outfit.jacket = scored[0].garment;
      }
    }
  }

  // ── Belt slot — auto-match to shoes ──────────────────────────────────────────
  outfit.belt = null;
  if (outfit.shoes && !pinnedSlots.belt) {
    const belts = wardrobe.filter(g => (g.type ?? g.category) === "belt");
    outfit.belt = pickBelt(outfit.shoes, belts);
  } else if (pinnedSlots.belt) {
    outfit.belt = pinnedSlots.belt;
  }

  // ── Pants-shoe palette coherence ───────────────────────────────────────────
  // If warm pants + black shoes (harmony < 0.4), try swapping pants to a cooler option.
  // Only auto-swap if strap forces black shoes (can't swap shoes instead).
  if (outfit.pants && outfit.shoes && !pinnedSlots.pants && !pinnedSlots.shoes) {
    const harmony = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (harmony <= 0.4) {
      // Check if strap constrains us to these shoes (leather strap → can't change shoes)
      const strapLocked = strapShoeScore(watchWithStrap, outfit.shoes) === 1.0
        && watchWithStrap.strap !== "bracelet" && watchWithStrap.strap !== "integrated";

      if (strapLocked) {
        // Can't change shoes → find better pants for these shoes
        const rejectState = useRejectStore.getState();
        const shoeTone = (outfit.shoes.color ?? "").toLowerCase();
        const altPants = wearable
          .filter(g => (g.type ?? g.category) === "pants" && g.id !== outfit.pants.id)
          .map(g => ({
            garment: g,
            score: scoreGarment(watchWithStrap, g, weather, outfitFormality, context) + diversityBonus(g, history),
            harmony: pantsShoeHarmony(g, outfit.shoes),
          }))
          .filter(p => p.score > 0 && p.harmony >= 0.7)
          .sort((a, b) => (b.score + b.harmony) - (a.score + a.harmony));
        if (altPants.length) {
          outfit.pants = altPants[0].garment;
          // Re-pick belt for consistency
          const belts = wardrobe.filter(g => (g.type ?? g.category) === "belt");
          outfit.belt = pickBelt(outfit.shoes, belts);
        }
      }
    }
  }

  // ── Dual-dial recommendation — attach pre-computed result ───────────────────
  outfit._recommendedDial = _dualDialRec;

  return outfit;
}

/**
 * Diversity penalty — avoid repeating garments from recent history.
 * Checks both outfit slot map (slot→id) and garmentIds array formats.
 */
function diversityBonus(garment, history) {
  const recent = (history ?? []).slice(-5);
  const usedCount = recent.filter(e => {
    // Format 1: outfit is { shirt: id, pants: id, ... } slot map
    const o = e.outfit ?? e.payload?.outfit ?? {};
    if (Object.values(o).includes(garment.id)) return true;
    // Format 2: garmentIds flat array (logged via TodayPanel / WatchDashboard)
    const ids = e.garmentIds ?? e.payload?.garmentIds ?? [];
    return ids.includes(garment.id);
  }).length;
  return usedCount > 0 ? -0.12 * Math.min(usedCount, 5) : 0;
}

/**
 * Explain why this outfit was chosen.
 */
export function explainOutfitChoice(watch, outfit, weather) {
  const filled = Object.values(outfit).filter(Boolean);
  if (!filled.length) {
    return `No garments in wardrobe yet. Add some and the engine will build around the ${watch.model}.`;
  }

  const parts = [
    `${watch.brand} ${watch.model} anchors this look (${watch.style}, formality ${watch.formality}/10).`,
  ];

  if (outfit.shirt) parts.push(`${outfit.shirt.name} (${outfit.shirt.color}) pairs with the ${watch.dial} dial.`);
  if (outfit.sweater) parts.push(`${outfit.sweater.name} layered for warmth.`);
  if (outfit.layer) parts.push(`${outfit.layer.name} as second layer for extra warmth.`);
  if (outfit.pants) parts.push(`${outfit.pants.name} complements the formality level.`);
  if (outfit.shoes) parts.push(`${outfit.shoes.name} ground the outfit.`);
  if (outfit.belt) {
    const beltShoeMatch = (outfit.belt.color ?? "").toLowerCase() === (outfit.shoes?.color ?? "").toLowerCase();
    parts.push(`${outfit.belt.name} ${beltShoeMatch ? "matches" : "coordinates with"} the shoes.`);
  }
  if (outfit.jacket && weather?.tempC != null) {
    parts.push(`${outfit.jacket.name} added for ${weather.tempC}°C weather.`);
  }

  // Palette note
  if (outfit.pants && outfit.shoes) {
    const h = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (h >= 0.9) parts.push("Pants and shoes are in perfect tonal harmony.");
    else if (h <= 0.5) parts.push("Note: pants-shoe tone transition is a stretch — consider swapping.");
  }

  // Dual-dial recommendation
  if (outfit._recommendedDial) {
    const d = outfit._recommendedDial;
    parts.push(`Reverso: wear ${d.label} side — ${d.side === "B" ? "white pops against dark outfit" : "navy adds depth to lighter palette"}.`);
  }

  return parts.join(" ");
}

// Exported for testing
export { _isPulloverType, _isCasualJacket };
