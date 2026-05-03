/**
 * Strap library — pure helpers for the Straps tab.
 *
 * Treats every strap (seed + custom) as first-class:
 *   - Lists every strap across the collection
 *   - Computes the watches each strap can pair with (its watch + any
 *     compatible watch via lug-width match — the cross-strap signal)
 *   - Suggests sample outfits for a strap × watch pair
 *
 * Notes:
 *   - Reads watchSeed.js but never mutates it (immutable rule).
 *   - Cross-watch compatibility is a soft pairing — same lug width AND
 *     compatible style family. A leather strap fits a sport watch with
 *     matching lug, but not a 19mm GS strap on a 22mm Monaco.
 */

import { WATCH_COLLECTION } from "../../data/watchSeed.js";

// Style families are interchangeable for cross-strap purposes. A bracelet for
// a dress-sport watch generally won't suit a pilot watch even if lugs match.
const STYLE_FAMILY = {
  dress: "elegant",
  "dress-sport": "elegant",
  "sport-elegant": "elegant",
  sport: "tool",
  pilot: "tool",
};

/**
 * Build the master strap list. Custom straps from the store (entries with
 * watchId) are merged in. Returns array of plain strap records, each
 * augmented with `originWatchId` and `originWatch`.
 */
export function buildStrapList(strapsRecord = {}) {
  const list = [];
  for (const s of Object.values(strapsRecord)) {
    if (!s || !s.id) continue;
    const originWatch = WATCH_COLLECTION.find(w => w.id === s.watchId) ?? null;
    list.push({
      ...s,
      originWatchId: s.watchId,
      originWatch,
    });
  }
  // Stable sort: type, then color, then label
  list.sort((a, b) => {
    const ta = (a.type ?? "").localeCompare(b.type ?? "");
    if (ta) return ta;
    const ca = (a.color ?? "").localeCompare(b.color ?? "");
    if (ca) return ca;
    return (a.label ?? "").localeCompare(b.label ?? "");
  });
  return list;
}

/**
 * Returns the watches a strap is compatible with. The owning watch is
 * always first; additional watches are added when:
 *   - Lug width matches exactly (the rigid constraint)
 *   - Style family aligns OR strap type is universal (NATO/canvas/rubber)
 *
 * Bracelets are watch-specific and never cross over.
 */
export function watchesForStrap(strap, watches = WATCH_COLLECTION) {
  if (!strap) return [];
  const owning = watches.find(w => w.id === strap.watchId);
  const out = owning ? [owning] : [];

  // Bracelets and integrated straps are watch-specific
  const type = (strap.type ?? "").toLowerCase();
  if (type === "bracelet" || type === "integrated") return out;

  // Look up lug width on the owning watch (strap doesn't carry it)
  const lug = owning?.lug ?? owning?.lugWidth;
  if (!lug) return out;

  const universal = ["nato", "canvas", "rubber"].includes(type);
  const ownerFamily = STYLE_FAMILY[owning?.style] ?? null;

  for (const w of watches) {
    if (!w || w.id === strap.watchId) continue;
    if (w.retired) continue;
    const wLug = w.lug ?? w.lugWidth;
    if (wLug !== lug) continue;
    if (!universal) {
      // Leather/alligator: require same style family
      const wFamily = STYLE_FAMILY[w.style] ?? null;
      if (!wFamily || !ownerFamily || wFamily !== ownerFamily) continue;
    }
    out.push(w);
  }
  return out;
}

/**
 * Sample-outfit hints. Pure synchronous fn — does not call buildOutfit
 * (which is async-loaded and weather-dependent). Returns a small structured
 * recommendation list keyed by context. Lets the tab render instantly
 * without waiting on the engine.
 */
export function sampleOutfitsForStrap(strap, watch) {
  if (!strap || !watch) return [];
  const color = (strap.color ?? "").toLowerCase();
  const type = (strap.type ?? "").toLowerCase();
  const recs = [];

  // Color-led shoe pairing (mirrors strap-shoe rule guideline)
  const isBlackish = ["black", "charcoal"].includes(color);
  const isBrownish = ["brown", "tan", "cognac", "olive"].includes(color);
  const isCool = ["navy", "blue", "teal", "grey", "silver"].includes(color);
  const isWarm = ["beige", "cream", "burgundy", "gold"].includes(color);

  if (type === "bracelet" || type === "integrated") {
    recs.push({ context: "Versatile", shoes: "Any color shoe", note: "Bracelet matches everything" });
  } else if (isBlackish) {
    recs.push({ context: "Clinic / Formal", shoes: "Black leather shoe", note: "Black-on-black classic" });
  } else if (isBrownish) {
    recs.push({ context: "Smart casual", shoes: "Brown Eccos / cognac leather", note: "Warm leather harmony" });
  } else if (isCool) {
    recs.push({ context: "Smart casual", shoes: "White sneakers or navy canvas sneakers", note: "Cool palette anchors" });
  } else if (isWarm) {
    recs.push({ context: "Date night", shoes: "Brown leather", note: "Warm tones echo" });
  } else {
    recs.push({ context: "Casual", shoes: "Versatile sneaker", note: "Neutral pairing" });
  }

  // Weather hint
  if (type === "leather" || type === "alligator") {
    recs.push({ context: "Cool weather", shoes: "Lower the cuff to expose the strap", note: "Leather earns its presence in autumn" });
  } else if (type === "rubber" || type === "nato" || type === "canvas") {
    recs.push({ context: "Hot weather", shoes: "Canvas or minimal leather sneakers", note: "Sweat-resistant strap, summer-friendly" });
  }

  // Watch context anchor
  const wf = watch.formality ?? 5;
  if (wf >= 8) {
    recs.push({ context: "Dressy", shoes: "Polished leather, slim sock", note: "Leans into the watch's formality" });
  } else if (wf <= 5) {
    recs.push({ context: "Weekend", shoes: "Sneakers or boots", note: "Casual energy, no jacket required" });
  }

  return recs;
}

/**
 * Group straps by type for the gallery view header counts.
 */
export function groupStrapsByType(strapList) {
  const groups = {};
  for (const s of strapList) {
    const t = s.type || "other";
    if (!groups[t]) groups[t] = [];
    groups[t].push(s);
  }
  return groups;
}
