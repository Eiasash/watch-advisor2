/**
 * Resolve a Claude AI pick response into concrete IDs against the user's
 * actual wardrobe + watch collection.
 *
 * Why this lives in its own module:
 *   The mapping logic was previously inline in WeekPlanner.jsx and had three
 *   subtle bugs:
 *     1. Name match was strict equality with a lowercase fallback. Trailing
 *        whitespace, leading/trailing quotes, or punctuation from the model
 *        broke the match silently — the slot fell back to the engine pick
 *        and the user saw an outfit that didn't match Claude's reasoning.
 *     2. In Different-watch mode, no validation that the model's chosen
 *        watchId was actually in the user's collection (or active). A
 *        hallucinated id silently failed — the chip "Different watch"
 *        appeared to do nothing.
 *     3. Tests couldn't exercise the mapping without mounting WeekPlanner.
 *
 * Pure functions, no React. Easy to unit-test the contract.
 */

/**
 * Normalize an AI-returned garment/strap label for matching:
 *   - Trim outer whitespace
 *   - Strip a single layer of surrounding quotes (smart or straight)
 *   - Lowercase
 *
 * @param {*} value — anything; non-strings return ""
 * @returns {string}
 */
export function normalizeAiName(value) {
  if (typeof value !== "string") return "";
  let s = value.trim();
  // Strip a single layer of quotes if both ends match (",',",",","')
  const QUOTES = ["\"", "'", "\u201C\u201D", "\u2018\u2019"];
  for (const pair of QUOTES) {
    const open = pair[0];
    const close = pair[pair.length - 1];
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(open.length, -close.length).trim();
      break;
    }
  }
  // Strip trailing punctuation that the model occasionally appends
  s = s.replace(/[.,;:!?]+$/, "").trim();
  return s.toLowerCase();
}

/**
 * Map an AI pick's slot names to wardrobe garment IDs.
 *
 * v1.13.20 — resolution order:
 *   1. EXACT id match. The prompt now asks the AI to return the id (e.g.
 *      `pants: "g_manual_navy_slim_chino"`) so the trivial path is fastest.
 *   2. Name match (normalized). Backward-compat for older prompt-cached
 *      responses + the case where the AI ignores the id instruction.
 *   3. Unmatched → caller decides fallback (engine pick).
 *
 * Both id and name matches are normalized (whitespace, quotes, punctuation,
 * case-insensitive). Returning false-positives is worse than returning
 * unmatched, so we don't fuzzy-match colors or substrings — only exact id
 * or fully-normalized name.
 *
 * @param {object} pick     — Claude response with shirt/sweater/pants/shoes/jacket fields
 * @param {Array}  garments — wardrobe rows (each must have id and name)
 * @param {Array<string>} slots — slot keys to consider (e.g. OUTFIT_SLOTS)
 * @returns {{ overrides: object, unmatched: Array<{slot, name, matchedBy?}> }}
 *   - overrides[slot] === id      → matched
 *   - overrides[slot] === null    → AI explicitly said no item ("null" / null)
 *   - overrides[slot] === undefined (omitted) → no match found; caller decides fallback
 *   - unmatched lists slot+name pairs that didn't resolve, for logging/UX warning
 */
export function resolveGarmentSlots(pick, garments, slots) {
  const overrides = {};
  const unmatched = [];
  if (!pick || typeof pick !== "object" || !Array.isArray(garments) || !Array.isArray(slots)) {
    return { overrides, unmatched };
  }

  // Pre-normalize once for O(slots * garments) instead of O(slots * garments * normalize)
  const normalizedGarments = garments.map(g => ({
    id: g.id,
    norm: normalizeAiName(g.name),
  }));
  // Index by id for O(1) id-match (case-sensitive — ids are slugs/timestamps,
  // not human-readable, so `g_manual_navy_polo` vs `G_MANUAL_NAVY_POLO`
  // would be a separate concern; keep strict for now).
  const idSet = new Set(garments.map(g => g.id));

  for (const slot of slots) {
    const raw = pick[slot];
    // Explicit "no item" — preserve as null in overrides so it doesn't fall
    // back to engine pick. Both literal null and the string "null" come up
    // depending on Claude's response shape.
    if (raw === null || raw === "null" || raw === "") {
      overrides[slot] = null;
      continue;
    }
    if (typeof raw !== "string") continue;

    // 1. Exact id match — fast path. The string raw might be `g_xx` or
    //    `id:g_xx` if the AI accidentally copied the prefix; strip it.
    const trimmedRaw = raw.trim();
    const idCandidate = trimmedRaw.startsWith("id:") ? trimmedRaw.slice(3).trim() : trimmedRaw;
    if (idSet.has(idCandidate)) {
      overrides[slot] = idCandidate;
      continue;
    }

    // 2. Name match — normalized.
    const target = normalizeAiName(raw);
    if (!target) continue;
    const match = normalizedGarments.find(g => g.norm === target);
    if (match) {
      overrides[slot] = match.id;
    } else {
      unmatched.push({ slot, name: raw });
    }
  }
  return { overrides, unmatched };
}

/**
 * Validate that a watch ID returned by Claude in Different-watch mode is one
 * the user actually owns and rotates. Defense-in-depth — the prompt says
 * "pick from this list" but model obedience is best-effort.
 *
 * Defense-in-depth resolution order:
 *   1. Exact match (canonical seed id, e.g. "laureato").
 *   2. Brand-prefix strip — Claude has historically prepended brand qualifiers
 *      ("gp_laureato", "ap_royal_oak", "chopard_alpine_eagle", "rolex_op_grape")
 *      because they're how watches are colloquially referenced. Strip a single
 *      leading recognized brand token + underscore and retry the match.
 *   3. Otherwise reject.
 *
 * Only one strip attempt — don't recursively chase. The seed never has IDs
 * with multiple brand prefixes stacked.
 *
 * @param {string|null} pickWatchId
 * @param {Array}       watches    — full watch collection
 * @param {function}    isActiveWatch — predicate from watchFilters.js
 * @returns {{ ok: boolean, watch?: object, reason?: string }}
 */
const BRAND_PREFIXES = [
  "gp", "ap", "chopard", "rolex", "cartier", "tag", "omega", "tudor",
  "jlc", "iwc", "vc", "grand_seiko", "gs", "breguet", "fears",
];

export function validateDifferentWatchPick(pickWatchId, watches, isActiveWatch) {
  if (!pickWatchId || typeof pickWatchId !== "string") {
    return { ok: false, reason: "no watchId in response" };
  }
  if (!Array.isArray(watches)) return { ok: false, reason: "no watch collection" };

  const tryMatch = (id) => {
    const matched = watches.find(w => w.id === id);
    if (!matched) return null;
    if (typeof isActiveWatch === "function" && !isActiveWatch(matched)) {
      return { ok: false, reason: `watch "${id}" is retired or pending` };
    }
    return { ok: true, watch: matched };
  };

  // 1. Exact
  let result = tryMatch(pickWatchId);
  if (result) return result;

  // 2. Strip known brand prefix
  const lower = pickWatchId.toLowerCase();
  for (const prefix of BRAND_PREFIXES) {
    if (lower.startsWith(prefix + "_")) {
      const stripped = lower.slice(prefix.length + 1);
      result = tryMatch(stripped);
      if (result) return result;
      break; // only strip one layer
    }
  }

  return { ok: false, reason: `watchId "${pickWatchId}" not in collection` };
}
