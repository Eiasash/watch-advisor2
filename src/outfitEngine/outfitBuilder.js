/**
 * Watch-driven outfit builder.
 *
 * Algorithm:
 * 1. Read selected watch
 * 2. Determine style
 * 3. Build shortlists for core slots (shirt/pants/shoes)
 * 4. Beam-search over shortlist combinations with pair-harmony scoring
 * 5. Fill remaining slots (jacket, sweater, layer, belt) with per-slot scoring
 */

import { STYLE_TO_SLOTS } from "./watchStyles.js";
import { scoreGarment, pantsShoeHarmony, pickBelt, strapShoeScore, filterShoesByStrap, clearScoreCache,
  colorMatchScore, formalityMatchScore, watchCompatibilityScore } from "./scoring.js";
import { useRejectStore } from "../stores/rejectStore.js";
import { useStrapStore } from "../stores/strapStore.js";
import { outfitConfidence } from "./confidence.js";
import { explainOutfit } from "./explain.js";
import { garmentDaysIdle, rotationPressure } from "../domain/rotationStats.js";
import { learnPreferenceWeights } from "../domain/preferenceLearning.js";
import { repetitionPenalty } from "../domain/contextMemory.js";

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

// Subtype keywords for sweater differentiation.
// Pullovers layer under zip-ups; two pullovers stacked = structural failure.
const OVER_LAYER_KEYWORDS = ["zip", "cardigan", "hoodie", "vest", "gilet"];

function _isPulloverType(name) {
  if (!name) return true;
  const n = name.toLowerCase();
  if (OVER_LAYER_KEYWORDS.some(k => n.includes(k))) return false;
  return true;
}

// Casual-coded jackets that should never appear in clinic/formal contexts.
const CASUAL_JACKET_KEYWORDS = ["bomber", "hoodie", "sweatshirt", "jogger", "fleece", "windbreaker", "anorak", "parka"];

function _isCasualJacket(name) {
  if (!name) return false;
  return CASUAL_JACKET_KEYWORDS.some(k => name.includes(k));
}

/**
 * Cross-slot coherence — scores how well a candidate garment harmonizes with
 * already-assigned outfit slots. Rewards palette coherence, penalizes exact
 * color duplication and warm/cool clashes.
 *
 * Returns a RAW value in the range -0.4 to +0.25.
 * Callers (specifically _scoreCandidate) are responsible for scaling this
 * relative to baseScore — do NOT add raw coherence directly to a multiplicative score.
 */
const _WARM = new Set(["brown","tan","cognac","dark brown","khaki","beige","cream","stone","camel","sand","ecru","burgundy","olive","brick","rust"]);
const _COOL = new Set(["black","navy","grey","slate","charcoal","indigo","dark navy"]);
function _crossSlotCoherence(candidate, filledColors) {
  const cc = (candidate.color ?? "").toLowerCase();
  if (!cc || !filledColors.length) return 0;

  if (filledColors.includes(cc)) return -0.4;

  const candidateTone = _WARM.has(cc) ? "warm" : _COOL.has(cc) ? "cool" : "neutral";
  if (candidateTone === "neutral") return 0.1;

  let warm = 0, cool = 0;
  for (const c of filledColors) {
    if (_WARM.has(c)) warm++;
    else if (_COOL.has(c)) cool++;
  }
  const dominant = warm >= cool ? "warm" : "cool";

  if (candidateTone === dominant) return 0.25;
  return -0.15;
}

// ── Pair-harmony helpers ──────────────────────────────────────────────────────

/**
 * Score a single garment with diversity bonus, rejection penalty, and
 * cross-slot coherence applied. Single entry point for all slot scoring.
 *
 * Hard-gate propagation: if scoreGarment returns -Infinity or ≤ 0, we return
 * that value unchanged so _shortlistCandidates can filter it out correctly.
 *
 * Penalty scaling: coherence/diversity constants were calibrated for the old
 * additive scoring system (0–10). In the multiplicative system (≈0.001–0.3)
 * they dwarf the base score and eliminate valid candidates. Penalties are now
 * expressed as fractions of the base score, keeping the ranking signal intact
 * without disqualifying garments that already passed the hard gates.
 */
function _scoreCandidate(watch, garment, weather, history, outfitFormality, context, rejectState, filledColors = [], preferenceWeights = null) {
  const baseScore = scoreGarment(watch, garment, weather, outfitFormality, context);
  // Propagate hard gates and true-zero strap-shoe blocks unchanged
  if (!isFinite(baseScore) || baseScore <= 0) return baseScore;

  let score = baseScore + diversityBonus(garment, history);
  // Flat rejection penalty — does not scale with base score
  if (rejectState.isRecentlyRejected(watch.id, [garment.id])) score -= 0.30;
  // Repetition penalty — binary signal: worn at all recently (complements diversityBonus)
  if (garment.id) score += repetitionPenalty(garment.id, history);
  // Garment rotation pressure — nudge idle pieces into recommendations (capped at 0.2)
  if (garment.id) {
    const gIdle = garmentDaysIdle(garment.id, history);
    score += rotationPressure(gIdle) * 0.2;
  }
  // Preference weight — apply learned formality lean as a soft multiplier on base
  if (preferenceWeights && preferenceWeights.formality !== 1) {
    // Shift: formality weight >1 boosts formal garments, <1 boosts casual ones
    const fLean = (preferenceWeights.formality - 1) * 0.1 * baseScore;
    score += fLean;
  }
  // Coherence bonus/penalty: scale to ±25% of base score
  if (filledColors.length > 0) {
    const coherence = _crossSlotCoherence(garment, filledColors); // raw: -0.4 to +0.25
    // Normalise: raw range is 0.65 wide; map to ±0.25 of base
    score += baseScore * (coherence / 0.65) * 0.25;
  }
  // Floor: never allow coherence/diversity to disqualify a hard-gate-passing garment
  return Math.max(1e-6, score);
}

/**
 * Build a scored shortlist: filter out invalid scores, sort, take top N.
 * Excludes -Infinity (hard-gated) and ≤ 0 candidates from selection.
 */
function _shortlistCandidates(candidates, limit, scoreFn) {
  return candidates
    .map(garment => ({ garment, score: scoreFn(garment) }))
    .filter(x => Number.isFinite(x.score) && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** True if two garments share the same non-empty color string. */
function _sameColor(a, b) {
  const ac = (a?.color ?? "").toLowerCase();
  const bc = (b?.color ?? "").toLowerCase();
  return ac && ac === bc;
}

/**
 * Outfit-level pair harmony score for a shirt/pants/shoes combination.
 * Penalises exact color matches between pieces and delegates to
 * pantsShoeHarmony for the pants→shoes tonal check.
 * Returns a multiplier (≤ 1.0).
 */
function _pairHarmonyScore(shirt, pants, shoes) {
  let score = 1.0;
  // Exact shirt–pants color match: avoid monotone top/bottom
  if (shirt && pants && _sameColor(shirt, pants)) score *= 0.82;
  // Exact shirt–shoes color match: odd visual echo (except white shoes)
  if (shirt && shoes && _sameColor(shirt, shoes) && (shoes.color ?? "").toLowerCase() !== "white") score *= 0.9;
  // Pants–shoes tonal harmony (warm/cool check from pantsShoeHarmony)
  score *= pantsShoeHarmony(pants, shoes);
  return score;
}

export function buildOutfit(watch, wardrobe, weather = {}, history = [], garmentIds = [], pinnedSlots = {}, excludedPerSlot = {}, context = null) {
  if (!watch) return {
    shirt: null, pants: null, shoes: null, jacket: null,
    sweater: null, layer: null, belt: null,
    _score: 0, _confidence: 0, _confidenceLabel: "none",
    _explanation: ["No watch selected."],
  };

  // Clear memoization cache so strap changes or watch swaps never serve stale scores
  clearScoreCache();

  // Derive preference weights once per call — passed to all _scoreCandidate invocations
  const preferenceWeights = learnPreferenceWeights(history);

  // Inject active strap label so strapShoeScore uses the real strap being worn today.
  const activeStrapObj = useStrapStore.getState().getActiveStrapObj?.(watch.id);
  let resolvedStrap = watch.strap;
  if (activeStrapObj) {
    resolvedStrap = activeStrapObj.label ?? activeStrapObj.color ?? watch.strap;
  } else if (watch.straps?.[0]) {
    const s0 = watch.straps[0];
    resolvedStrap = s0.label ?? (s0.color && s0.type ? `${s0.color} ${s0.type}` : s0.color ?? watch.strap);
  }
  const watchWithStrap = { ...watch, strap: resolvedStrap };

  // ── Dual-dial: start with sideA, re-evaluate after outfit is built ──────────
  let _dualDialRec = null;
  if (watch.dualDial) {
    watchWithStrap.dial = watch.dualDial.sideA;
  }

  const wearable = wardrobe.filter(g => !ACCESSORY_TYPES.has(g.type ?? g.category) && !g.excludeFromWardrobe);

  // Formality anchor: if slots are pinned, score others to complement them
  const pinnedList = Object.values(pinnedSlots).filter(Boolean);
  const outfitFormality = pinnedList.length > 0
    ? Math.round(pinnedList.reduce((s, g) => s + (g.formality ?? 5), 0) / pinnedList.length)
    : null;

  const slots = STYLE_TO_SLOTS[watch.style] ?? STYLE_TO_SLOTS["sport-elegant"];

  // Initialize all slots to null — ensures tests get null, not undefined, for empty slots
  const outfit = {
    shirt: null, pants: null, shoes: null,
    jacket: null, sweater: null, layer: null, belt: null,
  };

  // Hoist rejectStore once — used by _scoreCandidate and all subsequent blocks
  const rejectState = useRejectStore.getState();

  // ── Core slots: shortlist + beam-search combo selection ────────────────────
  // Shirt / pants / shoes are selected together via pair-harmony scoring rather
  // than greedily slot-by-slot. This prevents good individual pieces that clash
  // as a combination.

  // Apply pinned slots upfront
  for (const slotName of ["shirt", "pants", "shoes"]) {
    if (pinnedSlots[slotName]) outfit[slotName] = pinnedSlots[slotName];
  }

  // Build raw candidate pools for each unpinned core slot
  const coreSlotCandidates = {};
  for (const slotName of ["shirt", "pants", "shoes"]) {
    if (outfit[slotName]) continue;
    const type = slots[slotName];
    if (!type) continue;
    let pool = wearable.filter(g => {
      const gType = g.type ?? g.category;
      if (slotName === "shirt") return gType === "shirt" && !excludedPerSlot[slotName]?.has(g.id);
      if (excludedPerSlot[slotName]?.has(g.id)) return false;
      return gType === type;
    });
    // Shoes: pre-filter by strap–shoe rule BEFORE scoring so hard mismatches
    // can never be rescued by diversity / coherence bonuses in the shortlist.
    if (slotName === "shoes") pool = filterShoesByStrap(watchWithStrap, pool);
    coreSlotCandidates[slotName] = pool;
  }

  // Colours already locked by pinned slots — used as context for shortlist scoring
  const pinnedColors = Object.values(outfit).filter(Boolean).map(g => (g.color ?? "").toLowerCase());

  // Build top-N shortlists (N=5 shirts/pants, N=4 shoes)
  const shirtPool = outfit.shirt
    ? [{ garment: outfit.shirt, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.shirt ?? [], 5,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  const pantsPool = outfit.pants
    ? [{ garment: outfit.pants, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.pants ?? [], 5,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  const shoesPool = outfit.shoes
    ? [{ garment: outfit.shoes, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.shoes ?? [], 4,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  // Greedy defaults — best individual scores (fast path if no combo search)
  if (!outfit.shirt && shirtPool.length) outfit.shirt = shirtPool[0].garment;
  if (!outfit.pants && pantsPool.length) outfit.pants = pantsPool[0].garment;
  if (!outfit.shoes && shoesPool.length) outfit.shoes = shoesPool[0].garment;

  // Beam search over shortlist combinations — pick best by pair-harmony × sum-of-scores
  // Signals from the winning combo are captured for confidence + explanation.
  let _comboScore = null;
  if (shirtPool.length && pantsPool.length && shoesPool.length) {
    let bestCombo = null;
    for (const shirt of shirtPool) {
      for (const pants of pantsPool) {
        for (const shoes of shoesPool) {
          const comboScore =
            shirt.score + pants.score + shoes.score
            + _crossSlotCoherence(pants.garment, [(shirt.garment.color ?? "").toLowerCase()])
            + _crossSlotCoherence(shoes.garment, [
                (shirt.garment.color ?? "").toLowerCase(),
                (pants.garment.color ?? "").toLowerCase(),
              ]);
          const harmony = _pairHarmonyScore(shirt.garment, pants.garment, shoes.garment);
          const finalScore = comboScore * harmony;
          if (!bestCombo || finalScore > bestCombo.score) {
            bestCombo = {
              shirt: shirt.garment, pants: pants.garment, shoes: shoes.garment,
              score: finalScore,
              harmony,
            };
          }
        }
      }
    }
    if (bestCombo) {
      outfit.shirt = bestCombo.shirt;
      outfit.pants = bestCombo.pants;
      outfit.shoes = bestCombo.shoes;
      _comboScore = bestCombo.score;
      // Capture dimension signals from the winning shirt for explanation
      outfit._signals = {
        colorMatch:         colorMatchScore(watchWithStrap, bestCombo.shirt),
        formalityMatch:     formalityMatchScore(watchWithStrap, bestCombo.shirt),
        watchCompatibility: watchCompatibilityScore(watchWithStrap, bestCombo.shirt),
        harmonyScore:       bestCombo.harmony,
      };
    }
  }

  // ── Guard: empty wardrobe → safe fallback ──────────────────────────────────
  // Only fires when there are genuinely no wearable garments at all.
  // If garments exist but were filtered out by exclusions / strap rules, the
  // engine continues so secondary slots (sweater, jacket, belt) can still fill.
  // explainOutfit is never called in this path.
  if (!outfit.shirt && !outfit.pants && !outfit.shoes && wearable.length === 0) {
    return {
      shirt: null, pants: null, shoes: null,
      jacket: null, sweater: null, layer: null, belt: null,
      _score: 0,
      _confidence: 0,
      _confidenceLabel: "none",
      _explanation: ["No valid outfit combination found."],
    };
  }

  // ── Remaining slots (jacket etc.) — per-slot greedy scoring ──────────────
  // shirt / pants / shoes already handled above; skip them here.
  for (const [slotName, category] of Object.entries(slots)) {
    if (["shirt", "pants", "shoes"].includes(slotName)) continue;
    if (pinnedSlots[slotName]) {
      outfit[slotName] = pinnedSlots[slotName];
      continue;
    }
    const type = category;
    const candidates = wearable.filter(g => {
      const gType = g.type ?? g.category;
      if (excludedPerSlot[slotName]?.has(g.id)) return false;
      return gType === type;
    });

    if (!candidates.length) {
      outfit[slotName] = null;
      continue;
    }

    const filledColors = Object.values(outfit).filter(Boolean).map(g => (g.color ?? "").toLowerCase());
    const scored = candidates.map(g => ({
      garment: g,
      score: _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, filledColors, preferenceWeights),
    }));
    scored.sort((a, b) => b.score - a.score);

    outfit[slotName] = scored[0].garment;
  }

  // ── Multilayer logic ────────────────────────────────────────────────────────
  outfit.sweater = null;
  outfit.layer   = null;

  {
    const temp = weather?.tempC ?? 22;
    if (temp < 22) {
      const isFormalCtx = context === "formal" || context === "clinic"
        || context === "hospital-smart-casual" || context === "shift";
      const sweaters = wearable.filter(g => {
        if ((g.type ?? g.category) !== "sweater") return false;
        if (isFormalCtx) {
          const n = (g.name ?? "").toLowerCase();
          if (n.includes("hoodie") || n.includes("jogger") || n.includes("sweatshirt")) return false;
        }
        const watchF = watchWithStrap.formality ?? 5;
        const garmentF = g.formality ?? 5;
        if (garmentF < watchF - 3) return false;
        return true;
      });
      if (sweaters.length) {
        const swFilledColors = [outfit.shirt, outfit.pants, outfit.shoes, outfit.jacket]
          .filter(Boolean).map(g => (g.color ?? "").toLowerCase());
        const scored = sweaters.map(g => ({
          garment: g,
          score: _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, swFilledColors, preferenceWeights),
        }));
        scored.sort((a, b) => b.score - a.score);

        const shirtColor = (outfit.shirt?.color ?? "").toLowerCase();
        const bestSweater = scored.find(s =>
          s.score > 0 && (s.garment.color ?? "").toLowerCase() !== shirtColor
        ) ?? scored[0];
        outfit.sweater = pinnedSlots.sweater ?? (bestSweater?.score > 0 ? bestSweater.garment : null);

        if (temp < 8 && sweaters.length >= 2 && outfit.sweater) {
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

  // ── Jacket selection ────────────────────────────────────────────────────────
  if (weather?.tempC != null && !outfit.jacket) {
    const temp = weather.tempC;
    if (temp < 22) {
      const isFormalCtx = context === "formal" || context === "clinic"
        || context === "hospital-smart-casual" || context === "shift";
      const jackets = wearable.filter(g => {
        if ((g.type ?? g.category) !== "jacket") return false;
        if (isFormalCtx) {
          const n = (g.name ?? "").toLowerCase();
          if (_isCasualJacket(n)) return false;
        }
        return true;
      });
      if (jackets.length) {
        const jFilledColors = Object.values(outfit).filter(Boolean)
          .map(g => typeof g === "object" && g.color ? g.color.toLowerCase() : null)
          .filter(Boolean);
        const scored = jackets.map(g => ({
          garment: g,
          score: _scoreCandidate(watchWithStrap, g, weather, history, null, context, rejectState, jFilledColors, preferenceWeights),
        }));
        scored.sort((a, b) => b.score - a.score);
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

  // ── Pants-shoe palette coherence swap ──────────────────────────────────────
  if (outfit.pants && outfit.shoes && !pinnedSlots.pants && !pinnedSlots.shoes) {
    const harmony = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (harmony <= 0.4) {
      const strapLocked = strapShoeScore(watchWithStrap, outfit.shoes) === 1.0
        && watchWithStrap.strap !== "bracelet" && watchWithStrap.strap !== "integrated";

      if (strapLocked) {
        const shoeColors = [(outfit.shoes.color ?? "").toLowerCase()];
        const altPants = wearable
          .filter(g => (g.type ?? g.category) === "pants" && g.id !== outfit.pants.id)
          .map(g => ({
            garment: g,
            score: _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, shoeColors, preferenceWeights),
            harmony: pantsShoeHarmony(g, outfit.shoes),
          }))
          .filter(p => p.score > 0 && p.harmony >= 0.7)
          .sort((a, b) => (b.score + b.harmony) - (a.score + a.harmony));
        if (altPants.length) {
          outfit.pants = altPants[0].garment;
          const belts = wardrobe.filter(g => (g.type ?? g.category) === "belt");
          outfit.belt = pickBelt(outfit.shoes, belts);
        }
      }
    }
  }

  // ── Dual-dial recommendation ────────────────────────────────────────────────
  if (watch.dualDial) {
    const darkSet = new Set(["black","navy","charcoal","dark brown","indigo","slate","dark navy"]);
    const outfitColors = [outfit.shirt, outfit.sweater, outfit.layer, outfit.pants, outfit.jacket]
      .filter(Boolean).map(g => (g.color ?? "").toLowerCase());
    const darkCount = outfitColors.filter(c => darkSet.has(c)).length;
    const totalCount = outfitColors.length || 1;

    if (darkCount / totalCount >= 0.5) {
      _dualDialRec = { side: "B", dial: watch.dualDial.sideB, label: watch.dualDial.sideB_label };
    } else {
      _dualDialRec = { side: "A", dial: watch.dualDial.sideA, label: watch.dualDial.sideA_label };
    }
  }
  outfit._recommendedDial = _dualDialRec;

  // ── Confidence + explanation ─────────────────────────────────────────────
  // When _comboScore is null, no valid shirt/pants/shoes combination was built.
  // Force "none" label regardless of what outfitConfidence(0) would return ("weak").
  const { confidence: _rawConfidence, confidenceLabel: _rawLabel } = outfitConfidence(_comboScore ?? 0);
  const confidence = Math.max(0, _rawConfidence);
  const confidenceLabel = _comboScore === null ? "none" : _rawLabel;
  outfit._score           = _comboScore ?? null;
  outfit._confidence      = _comboScore === null ? 0 : confidence;
  outfit._confidenceLabel = confidenceLabel;
  const _capturedSignals = outfit._signals ?? null;
  // _signals is internal — clean it off before passing to explainOutfit
  delete outfit._signals;
  outfit._explanation = explainOutfit(watch, outfit, _capturedSignals
    ? {
        colorMatch:         _capturedSignals.colorMatch,
        formalityMatch:     _capturedSignals.formalityMatch,
        watchCompatibility: _capturedSignals.watchCompatibility,
        pairHarmonyScore:   _capturedSignals.harmonyScore,
      }
    : {}, weather);

  return outfit;
}

/**
 * Diversity penalty — avoid repeating garments from recent history.
 */
function diversityBonus(garment, history) {
  const recent = (history ?? []).slice(-5);
  const usedCount = recent.filter(e => {
    const o = e.outfit ?? e.payload?.outfit ?? {};
    if (Object.values(o).includes(garment.id)) return true;
    const ids = e.garmentIds ?? e.payload?.garmentIds ?? [];
    return ids.includes(garment.id);
  }).length;
  return usedCount > 0 ? -0.12 * Math.min(usedCount, 5) : 0;
}

/**
 * Explain why this outfit was chosen.
 */
export function explainOutfitChoice(watch, outfit, weather) {
  // Filter for actual garment objects only — exclude metadata fields like _score, _explanation etc.
  const filled = Object.values(outfit).filter(v => v && typeof v === "object" && (v.name || v.type || v.category));
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

  if (outfit.pants && outfit.shoes) {
    const h = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (h >= 0.9) parts.push("Pants and shoes are in perfect tonal harmony.");
    else if (h <= 0.5) parts.push("Note: pants-shoe tone transition is a stretch — consider swapping.");
  }

  if (outfit._recommendedDial) {
    const d = outfit._recommendedDial;
    parts.push(`Reverso: wear ${d.label} side — ${d.side === "B" ? "white pops against dark outfit" : "navy adds depth to lighter palette"}.`);
  }

  return parts.join(" ");
}

// Exported for testing
export { _isPulloverType, _isCasualJacket, _pairHarmonyScore, _sameColor };
