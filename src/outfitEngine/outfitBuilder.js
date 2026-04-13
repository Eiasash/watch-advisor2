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

import { recentHistory } from "../domain/historyWindow.js";
import { STYLE_TO_SLOTS } from "./watchStyles.js";
import { recommendStrap as _recommendStrap } from "./strapRecommender.js";
import { scoreGarment, pantsShoeHarmony, pickBelt, strapShoeScore, clearScoreCache,
  colorMatchScore, formalityMatchScore, watchCompatibilityScore } from "./scoring.js";
import { REPLICA_PENALTY, OUTFIT_TEMP_THRESHOLDS } from "../config/scoringWeights.js";
import { useRejectStore } from "../stores/rejectStore.js";
import { useStrapStore } from "../stores/strapStore.js";
import { buildRejectionProfile } from "../domain/rejectionIntelligence.js";
import { outfitConfidence } from "./confidence.js";
import { explainOutfit } from "./explain.js";
import { learnPreferenceWeights } from "../domain/preferenceLearning.js";
import { registerFactor, applyFactors } from "./scoringFactors/index.js";
import diversityFactor      from "./scoringFactors/diversityFactor.js";
import repetitionFactor     from "./scoringFactors/repetitionFactor.js";
import rotationFactor       from "./scoringFactors/rotationFactor.js";
import seasonContextFactor  from "./scoringFactors/seasonContextFactor.js";
import weightFactor         from "./scoringFactors/weightFactor.js";

// Lazy init — register factors on first buildOutfit call, not at module top-level.
// Top-level registerFactor() calls caused TDZ crashes in Rollup's minified output
// because module-level side effects ran before const declarations were initialised.
let _factorsRegistered = false;
function _ensureFactors() {
  if (_factorsRegistered) return;
  _factorsRegistered = true;
  // colorFactor and formalityFactor removed — those dimensions are already in
  // baseScore from scoreGarment() and were always returning 0 here (candidate.colorScore
  // and candidate.formalityScore were never populated).
  registerFactor(diversityFactor);
  registerFactor(repetitionFactor);
  registerFactor(rotationFactor);
  registerFactor(seasonContextFactor);
  registerFactor(weightFactor);
}

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

// Contexts where replica watches receive a scoring penalty.
// Module-scoped to avoid rebuilding the Set on every _scoreCandidate call.
const FORMAL_CONTEXTS = new Set(["formal","clinic","shift"]);

// Subtype keywords for sweater differentiation.
// Pullovers layer under zip-ups; two pullovers stacked = structural failure.
const OVER_LAYER_KEYWORDS = ["zip", "cardigan", "hoodie", "vest", "gilet"];

function _isPulloverType(name) {
  if (!name) return true;
  const n = name.toLowerCase();
  if (OVER_LAYER_KEYWORDS.some(kw => n.includes(kw))) return false;
  return true;
}

// Casual-coded jackets that should never appear in clinic/formal contexts.
const CASUAL_JACKET_KEYWORDS = ["bomber", "hoodie", "sweatshirt", "jogger", "fleece", "windbreaker", "anorak", "parka"];

function _isCasualJacket(name) {
  if (!name) return false;
  return CASUAL_JACKET_KEYWORDS.some(kw => name.includes(kw));
}

/**
 * Cross-slot coherence — scores how well a candidate garment harmonizes with
 * already-assigned outfit slots.
 *
 * v2 logic (March 2026):
 *   The old model penalised warm/cool contrast (-0.15), which was backwards.
 *   Brick sweater + navy chinos IS the intended styling — deliberate contrast,
 *   not a failure. New model rewards contrast and only penalises monotone stacking.
 *
 *   - Exact color repeat                        → -0.40 (always bad)
 *   - Neutral candidate (grey, white, stone…)   → +0.10 (bridges any palette)
 *   - Warm/cool contrast introduced             → +0.20 (intentional contrast)
 *   - Same tone as dominant, 1 existing         → +0.15 (tonal layering, fine)
 *   - Same tone as dominant, 2+ existing        → -0.05 (palette getting monotone)
 *
 * Returns raw value in range -0.40 to +0.20. Callers scale relative to baseScore.
 */
const _WARM = new Set(["brown","tan","cognac","dark brown","khaki","beige","cream","stone","camel","sand","ecru","burgundy","olive","brick","rust","yellow","coral"]);
const _COOL = new Set(["black","navy","grey","slate","charcoal","indigo","dark navy","denim","blue","light blue","teal","lavender"]);
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
  const dominantCount = warm >= cool ? warm : cool;

  // Candidate introduces contrast → reward deliberate warm/cool pairing
  if (candidateTone !== dominant) return 0.20;

  // Same tone as dominant: fine for first, slightly penalise monotone accumulation
  return dominantCount >= 2 ? -0.05 : 0.15;
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
// Module-level rejection profile — set by buildOutfit(), read by _scoreCandidate()
let _rejectionProfile = null;

function _scoreCandidate(watch, garment, weather, history, outfitFormality, context, rejectState, filledColors = [], preferenceWeights = null) {
  const baseScore = scoreGarment(watch, garment, weather, outfitFormality, context);
  // Propagate hard gates and true-zero strap-shoe blocks unchanged
  if (!isFinite(baseScore) || baseScore <= 0) return baseScore;

  // Build candidate + context objects for the factor pipeline
  const candidate = {
    garment,
    baseScore,
    diversityBonus: diversityBonus(garment, history),
  };
  const factorCtx = {
    watch,
    weather,
    history,
    rejectState,
    filledColors,
    preferenceWeights,
    outfitContext: context, // string e.g. "clinic", "smart-casual"
  };

  // Run all registered factors (diversity, repetition, rotation, seasonContext, …)
  let score = baseScore + applyFactors(candidate, factorCtx);

  // Flat rejection penalty — not a factor because it's a global veto, not a scoring nudge
  if (rejectState.isRecentlyRejected(watch.id, [garment.id])) score -= 0.30;

  // Rejection intelligence penalty — learned from rejection patterns
  // Stacks with flat penalty for garments that are BOTH recently rejected AND pattern-rejected
  if (_rejectionProfile) {
    score += _rejectionProfile.penaltyFor(garment.id, context);
  }

  // Replica context penalty — collection philosophy: zero replica in clinic/formal/shift.
  // Applied as a strong score reduction (not a hard gate) so the engine still has
  // candidates in edge cases where only replicas exist in the wardrobe.
  if (watch.replica && FORMAL_CONTEXTS.has(context)) score -= baseScore * REPLICA_PENALTY;

  // Preference weight — formality lean derived from wear history
  if (preferenceWeights && preferenceWeights.formality !== 1) {
    score += (preferenceWeights.formality - 1) * 0.1 * baseScore;
  }

  // Coherence bonus/penalty: scale to ±20% of base score.
  // raw range is -0.40 to +0.20 — normalised by 0.60 then scaled to 0.20.
  if (filledColors.length > 0) {
    const coherence = _crossSlotCoherence(garment, filledColors); // raw: -0.40 to +0.20
    score += baseScore * (coherence / 0.60) * 0.20;
  }

  // Floor: never allow post-score adjustments to disqualify a hard-gate-passing garment
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

/**
 * Fill sweater + layer slots. Extracted into a function to create a proper
 * function scope — bare block `{ }` scopes were flattened by esbuild's minifier,
 * causing the filter callback parameter and const declarations to collide under
 * the same minified name (TDZ: "Cannot access 'k' before initialization").
 */
function _fillSweaterLayer(outfit, wearable, watchWithStrap, weather, history, outfitFormality, context, rejectState, preferenceWeights, pinnedSlots) {
  const temp = weather?.tempC ?? 15;
  if (temp >= 22) return;

  // 18-22°C = warm transition zone. Sweater is optional — only add if high-scoring.
  // Below 18°C = sweater strongly recommended (normal flow).
  const warmTransition = temp >= OUTFIT_TEMP_THRESHOLDS.warmTransition;
  const minSweaterScore = warmTransition ? 4.0 : 0; // higher bar in warm weather

  const isFormalCtx = context === "formal"
    || context === "hospital-smart-casual" || context === "clinic" || context === "shift";
  const sweaters = wearable.filter(candidate => {
    if ((candidate.type) !== "sweater") return false;
    if (isFormalCtx) {
      const nm = (candidate.name ?? "").toLowerCase();
      if (nm.includes("hoodie") || nm.includes("jogger") || nm.includes("sweatshirt")) return false;
    }
    const watchF = watchWithStrap.formality ?? 5;
    const garmentF = candidate.formality ?? 5;
    if (garmentF < watchF - 3) return false;
    return true;
  });
  if (!sweaters.length) return;

  const swFilledColors = [outfit.shirt, outfit.pants, outfit.shoes, outfit.jacket]
    .filter(Boolean).map(item => (item.color ?? "").toLowerCase());
  const scored = sweaters.map(candidate => ({
    garment: candidate,
    score: _scoreCandidate(watchWithStrap, candidate, weather, history, outfitFormality, context, rejectState, swFilledColors, preferenceWeights),
  }));
  scored.sort((a, b) => b.score - a.score);

  const shirtColor = (outfit.shirt?.color ?? "").toLowerCase();
  const bestSweater = scored.find(entry =>
    entry.score > 0 && (entry.garment.color ?? "").toLowerCase() !== shirtColor
  ) ?? scored[0];
  outfit.sweater = pinnedSlots.sweater ?? (bestSweater?.score > minSweaterScore ? bestSweater.garment : null);

  if (temp < OUTFIT_TEMP_THRESHOLDS.layerDouble && sweaters.length >= 2 && outfit.sweater) {
    if (pinnedSlots.layer) {
      outfit.layer = pinnedSlots.layer;
    } else {
      const sweaterColor = (outfit.sweater.color ?? "").toLowerCase();
      const primaryName = (outfit.sweater.name ?? "").toLowerCase();
      const isPrimaryPullover = _isPulloverType(primaryName);

      const secondBest = scored.find(entry => {
        if (entry.garment.id === outfit.sweater.id) return false;
        if (entry.score <= 0) return false;
        const col = (entry.garment.color ?? "").toLowerCase();
        if (col === sweaterColor || col === shirtColor) return false;
        const layerName = (entry.garment.name ?? "").toLowerCase();
        if (isPrimaryPullover && _isPulloverType(layerName)) return false;
        return true;
      });
      if (secondBest) outfit.layer = secondBest.garment;
    }
  }
}

/**
 * Fill jacket slot when temp < 22°C. Same TDZ-prevention rationale as above.
 */
function _fillJacket(outfit, wearable, watchWithStrap, weather, history, outfitFormality, context, rejectState, preferenceWeights) {
  const temp = weather.tempC;
  if (temp >= 22) return;

  const isFormalCtx = context === "formal"
    || context === "hospital-smart-casual" || context === "clinic" || context === "shift";
  const jackets = wearable.filter(candidate => {
    if ((candidate.type) !== "jacket") return false;
    if (isFormalCtx) {
      const nm = (candidate.name ?? "").toLowerCase();
      if (_isCasualJacket(nm)) return false;
    }
    return true;
  });
  if (!jackets.length) return;

  const jFilledColors = Object.values(outfit).filter(Boolean)
    .map(item => typeof item === "object" && item.color ? item.color.toLowerCase() : null)
    .filter(Boolean);
  const scored = jackets.map(candidate => ({
    garment: candidate,
    score: _scoreCandidate(watchWithStrap, candidate, weather, history, outfitFormality, context, rejectState, jFilledColors, preferenceWeights),
  }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score > 0) outfit.jacket = scored[0].garment;
}

export function buildOutfit(watch, wardrobe, weather = {}, history = [], garmentIds = [], pinnedSlots = {}, excludedPerSlot = {}, context = null) {
  if (!watch) return {
    shirt: null, pants: null, shoes: null, jacket: null,
    sweater: null, layer: null, belt: null,
    _score: 0, _confidence: 0, _confidenceLabel: "none",
    _explanation: ["No watch selected."],
  };

  // Ensure scoring factors are registered (lazy init to avoid top-level TDZ)
  _ensureFactors();

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
  const watchWithStrap = { ...watch, strap: resolvedStrap, _activeStrapId: activeStrapObj?.id ?? null };

  // ── Dual-dial: start with sideA, re-evaluate after outfit is built ──────────
  let _dualDialRec = null;
  if (watch.dualDial) {
    watchWithStrap.dial = watch.dualDial.sideA;
  }

  const TAILOR_RE = /tailor|pulls at chest|billows|wide in torso|cuffs too|too wide|too long|needs shortening/i;
  const formalContext = FORMAL_CONTEXTS.has(context);
  const wearable = wardrobe.filter(g => {
    if (ACCESSORY_TYPES.has(g.type) || g.excludeFromWardrobe) return false;
    // Exclude tailor-flagged garments from clinic/formal contexts
    if (formalContext && (g.fit === "tight" || g.fit === "needs-tailor" || TAILOR_RE.test(g.notes ?? ""))) return false;
    return true;
  });

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
  // Build rejection intelligence profile from accumulated rejection data
  _rejectionProfile = buildRejectionProfile(rejectState.entries);

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
      const gType = g.type;
      if (slotName === "shirt") return gType === "shirt" && !excludedPerSlot[slotName]?.has(g.id);
      if (excludedPerSlot[slotName]?.has(g.id)) return false;
      return gType === type;
    });
    coreSlotCandidates[slotName] = pool;
  }

  // ── Never-worn slot reservation ────────────────────────────────────────────
  // Every 3rd outfit, guarantee at least one never-worn garment in the shortlist
  // by finding the best-scoring never-worn item per slot and ensuring it's included.
  const _wornIds = new Set(history.flatMap(h => h.garmentIds ?? h.payload?.garmentIds ?? []));
  const _shouldForceNeverWorn = history.length > 0 && history.length % 3 === 0;
  let _neverWornForced = null;

  if (_shouldForceNeverWorn) {
    // Pick the slot with the most never-worn options (usually shirts)
    for (const slotName of ["shirt", "pants"]) {
      if (outfit[slotName]) continue;
      const pool = coreSlotCandidates[slotName] ?? [];
      const neverWorn = pool.filter(g => !_wornIds.has(g.id));
      if (neverWorn.length > 0) {
        // Score them and pick the best
        const scored = neverWorn.map(g => ({
          garment: g,
          score: _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState,
            Object.values(outfit).filter(Boolean).map(x => (x.color ?? "").toLowerCase()), preferenceWeights),
        }));
        scored.sort((a, b) => b.score - a.score);
        _neverWornForced = { slot: slotName, garment: scored[0].garment };
        break;
      }
    }
  }

  // Colours already locked by pinned slots — used as context for shortlist scoring
  const pinnedColors = Object.values(outfit).filter(Boolean).map(g => (g.color ?? "").toLowerCase());

  // Build top-N shortlists (N=5 shirts/pants, N=4 shoes)
  let shirtPool = outfit.shirt
    ? [{ garment: outfit.shirt, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.shirt ?? [], 5,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  let pantsPool = outfit.pants
    ? [{ garment: outfit.pants, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.pants ?? [], 5,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  const shoesPool = outfit.shoes
    ? [{ garment: outfit.shoes, score: 1 }]
    : _shortlistCandidates(coreSlotCandidates.shoes ?? [], 6,
        g => _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, pinnedColors, preferenceWeights));

  // Inject never-worn garment into the target shortlist if not already present
  if (_neverWornForced) {
    const targetPool = _neverWornForced.slot === "shirt" ? shirtPool : pantsPool;
    const alreadyIn = targetPool.some(e => e.garment.id === _neverWornForced.garment.id);
    if (!alreadyIn) {
      const nwScore = _scoreCandidate(watchWithStrap, _neverWornForced.garment, weather, history,
        outfitFormality, context, rejectState, pinnedColors, preferenceWeights);
      // Insert at position 1 (after best, before rest) so it competes in beam search
      targetPool.splice(1, 0, { garment: _neverWornForced.garment, score: nwScore });
    }
  }

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
        // Season/context signals for explanation
        shirtSeasons:   bestCombo.shirt.seasons  ?? [],
        shirtContexts:  bestCombo.shirt.contexts ?? [],
        outfitContext:  context,
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
      const gType = g.type;
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
  _fillSweaterLayer(outfit, wearable, watchWithStrap, weather, history, outfitFormality, context, rejectState, preferenceWeights, pinnedSlots);

  // ── Jacket selection ────────────────────────────────────────────────────────
  if (weather?.tempC != null && !outfit.jacket) {
    _fillJacket(outfit, wearable, watchWithStrap, weather, history, outfitFormality, context, rejectState, preferenceWeights);
  }

  // ── Belt slot — auto-match to shoes ──────────────────────────────────────────
  outfit.belt = null;
  if (outfit.shoes && !pinnedSlots.belt) {
    const belts = wardrobe.filter(g => (g.type) === "belt");
    outfit.belt = pickBelt(outfit.shoes, belts);
  } else if (pinnedSlots.belt) {
    outfit.belt = pinnedSlots.belt;
  }

  // ── Strap auto-recommendation ────────────────────────────────────────────
  // Use the full strapRecommender which considers shoe color, outfit palette,
  // context formality, and dial harmony — not just shoe matching.
  if (outfit.shoes && watch.straps?.length > 1) {
    const rec = _recommendStrap(watch, outfit, context);
    if (rec?.recommended && rec.recommended.id !== watchWithStrap._activeStrapId) {
      outfit._strapRecommendation = { id: rec.recommended.id, label: rec.recommended.label };
    } else {
      outfit._strapRecommendation = null;
    }
  }

  // ── Pants-shoe palette coherence swap ──────────────────────────────────────
  if (outfit.pants && outfit.shoes && !pinnedSlots.pants && !pinnedSlots.shoes) {
    const harmony = pantsShoeHarmony(outfit.pants, outfit.shoes);
    if (harmony <= 0.4) {
      const strapLocked = strapShoeScore(watchWithStrap, outfit.shoes, context) === 1.0
        && watchWithStrap.strap !== "bracelet" && watchWithStrap.strap !== "integrated";

      if (strapLocked) {
        const shoeColors = [(outfit.shoes.color ?? "").toLowerCase()];
        const altPants = wearable
          .filter(g => (g.type) === "pants" && g.id !== outfit.pants.id)
          .map(g => ({
            garment: g,
            score: _scoreCandidate(watchWithStrap, g, weather, history, outfitFormality, context, rejectState, shoeColors, preferenceWeights),
            harmony: pantsShoeHarmony(g, outfit.shoes),
          }))
          .filter(p => p.score > 0 && p.harmony >= 0.7)
          .sort((a, b) => (b.score + b.harmony) - (a.score + a.harmony));
        if (altPants.length) {
          outfit.pants = altPants[0].garment;
          const belts = wardrobe.filter(g => (g.type) === "belt");
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
  const explanationLines = explainOutfit(watch, outfit, _capturedSignals
    ? {
        colorMatch:         _capturedSignals.colorMatch,
        formalityMatch:     _capturedSignals.formalityMatch,
        watchCompatibility: _capturedSignals.watchCompatibility,
        pairHarmonyScore:   _capturedSignals.harmonyScore,
        shirtSeasons:       _capturedSignals.shirtSeasons,
        shirtContexts:      _capturedSignals.shirtContexts,
        outfitContext:      _capturedSignals.outfitContext,
      }
    : {}, weather);
  // When no valid combo was found, prepend a fallback message
  if (_comboScore === null) {
    explanationLines.unshift("No valid outfit combination found.");
  }
  outfit._explanation = explanationLines;

  // ── Per-slot scoring breakdown — for UI chips ──────────────────────────────
  const _slotSignals = {};
  for (const slotName of ["shirt", "sweater", "layer", "pants", "shoes", "jacket"]) {
    const g = outfit[slotName];
    if (!g) continue;
    const cm = colorMatchScore(watchWithStrap, g);
    const fm = formalityMatchScore(watchWithStrap, g, outfitFormality);
    const wc = watchCompatibilityScore(watchWithStrap, g);
    _slotSignals[slotName] = { colorMatch: cm, formalityMatch: fm, watchCompat: wc };
  }
  outfit._slotSignals = _slotSignals;

  return outfit;
}

/** Calendar-day-aware recent history for diversity scoring. */
function _recentHistoryForDiversity(history) {
  return recentHistory(history ?? [], 7);
}

/**
 * Diversity penalty — avoid repeating garments from recent history.
 */
function diversityBonus(garment, history) {
  // 7-day calendar window: matches the recency window used in scoreWatchForDay.
  const recent = _recentHistoryForDiversity(history);
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
  const filled = Object.values(outfit).filter(v => v && typeof v === "object" && (v.name || v.type));
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
