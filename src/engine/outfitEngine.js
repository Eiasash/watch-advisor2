/**
 * Outfit engine — slot-based scoring.
 * Slots: shirt, pants, shoes, jacket
 */

// Dial color → compatible garment colors (unified with outfitEngine/scoring.js)
const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "gray", "grey", "white", "beige", "slate"],
  "green":        ["olive", "beige", "brown", "gray", "grey", "khaki", "cream"],
  "grey":         ["black", "white", "navy", "gray", "grey", "stone", "beige"],
  "blue":         ["navy", "gray", "grey", "white", "beige", "stone", "black"],
  "navy":         ["gray", "grey", "white", "black", "beige", "stone", "cream"],
  "white":        ["black", "navy", "gray", "grey", "beige", "stone", "brown"],
  "black-red":    ["black", "gray", "grey", "white", "red"],
  "black":        ["black", "white", "gray", "grey", "navy", "olive", "brown"],
  "white-teal":   ["gray", "grey", "white", "black", "navy", "teal"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone"],
  "purple":       ["grey", "black", "navy", "white", "stone"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream"],
  "red":          ["black", "grey", "white", "navy"],
  "meteorite":    ["black", "grey", "navy", "white", "brown"],
};

const ACCESSORY_TYPES = new Set(["belt","sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

// Context → slot groupings for legacy subtype normalisation
const SLOT_MAP = {
  shirt:     ["shirt","polo","tee","flannel","overshirt"],
  sweater:   ["sweater","crewneck","cardigan","hoodie"],
  pants:     ["pants","jeans","chinos","shorts","joggers","corduroy"],
  shoes:     ["shoes","boots","sneakers","loafers","sandals"],
  jacket:    ["jacket","coat","blazer","bomber","vest"],
};

// dayProfile → garment context tags that match
const CONTEXT_COMPAT = {
  "clinic":                 ["clinic","formal"],
  "hospital-smart-casual":  ["clinic","smart-casual","formal"],
  "smart-casual":           ["smart-casual","casual","date-night"],
  "casual":                 ["casual"],
  "date-night":             ["date-night","smart-casual","riviera"],
  "riviera":                ["riviera","casual","smart-casual"],
  "formal":                 ["formal","clinic"],
};

const SEASON_NOW = (() => {
  const m = new Date().getMonth(); // 0-based
  if (m >= 2 && m <= 4)  return "spring";
  if (m >= 5 && m <= 7)  return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
})();

function contextScore(garment, dayProfile) {
  const gc = garment.contexts ?? [];
  if (!gc.length) return 0.75; // untagged — neutral
  const compatible = CONTEXT_COMPAT[dayProfile] ?? ["smart-casual","casual"];
  return gc.some(c => compatible.includes(c)) ? 1.0 : 0.15;
}

function seasonScore(garment) {
  const gs = garment.seasons ?? [];
  if (!gs.length) return 0.75; // untagged — neutral
  if (gs.includes("all-season")) return 1.0;
  return gs.includes(SEASON_NOW) ? 1.0 : 0.25;
}

function slotType(g) {
  return g.type ?? g.category ?? "";
}

function slotMatches(gType, slot) {
  return (SLOT_MAP[slot] ?? [slot]).includes(gType);
}

function formalityScore(watch, garment) {
  const diff = Math.abs((watch.formality ?? 5) - (garment.formality ?? 5));
  return Math.max(0, 1 - diff / 5);
}

function colorScore(watch, garment) {
  const compatible = DIAL_COLOR_MAP[watch.dial] ?? [];
  const gc = (garment.color ?? "").toLowerCase();
  return compatible.includes(gc) ? 1 : 0.4;
}

function strapScore(watch, garment) {
  const strap = (watch.strap ?? "").toLowerCase();

  if (strap === "bracelet" || strap === "integrated" || strap === "") return 0.75;

  const isNatoCasual = strap.includes("nato") || strap.includes("canvas") || strap.includes("rubber");
  if (isNatoCasual) {
    if (garment.type === "shoes") {
      return ["white", "grey", "tan"].includes(garment.color?.toLowerCase()) ? 1.0 : 0.7;
    }
    return 0.75;
  }

  const isLeather = strap.includes("leather") || strap.includes("alligator")
    || strap.includes("calfskin") || strap.includes("suede");
  if (!isLeather) return 0.75;

  if (garment.type === "shoes") {
    const shoeColor = (garment.color ?? "").toLowerCase();
    const isBlack = strap.includes("black");
    const isBrown = strap.includes("brown") || strap.includes("tan") || strap.includes("honey")
      || strap.includes("cognac") || strap.includes("caramel") || strap.includes("alligator");
    if (isBlack) return shoeColor === "black" ? 1.0 : 0.0;
    if (isBrown) return ["brown", "tan", "cognac", "dark brown"].includes(shoeColor) ? 1.0 : 0.0;
    // Non-standard leather (teal, olive etc.)
    return ["white", "brown", "tan"].includes(shoeColor) ? 0.85 : 0.5;
  }
  return 0.7;
}

function weatherScore(garment, weather) {
  if (!weather) return 0.75;
  const { tempC = 22 } = weather;
  if (garment.type === "jacket") return tempC > 26 ? 0.2 : tempC < 10 ? 1 : 0.75;
  return 0.75;
}

function diversityPenalty(garment, history) {
  const recent = history.slice(-5);
  const usedCount = recent.filter(e => {
    const outfit = e.outfit ?? e.payload?.outfit ?? {};
    return Object.values(outfit).includes(garment.id);
  }).length;
  // -0.12 per appearance, capped at -0.6 so a 5× repeated garment loses 0.6 points
  return usedCount > 0 ? -0.12 * Math.min(usedCount, 5) : 0;
}

export function garmentScore(watch, garment, weather, history, dayProfile = "smart-casual") {
  return (
    0.25 * formalityScore(watch, garment) +
    0.20 * colorScore(watch, garment) +
    0.15 * strapScore(watch, garment) +
    0.08 * weatherScore(garment, weather) +
    0.17 * (1 + diversityPenalty(garment, history)) +
    0.10 * contextScore(garment, dayProfile) +
    0.05 * seasonScore(garment)
  );
}

export function generateOutfit(watch, wardrobe, weather = {}, profile = {}, history = []) {
  const dayProfile = profile.context ?? profile.dayProfile ?? "smart-casual";
  // Filter out accessories and excluded items
  const wearable = wardrobe.filter(g => !ACCESSORY_TYPES.has(slotType(g)) && !g.excludeFromWardrobe);

  const slots = ["shirt", "pants", "shoes", "jacket"];
  const outfit = {};
  for (const slot of slots) {
    const items = wearable.filter(g => slotMatches(slotType(g), slot));
    if (!items.length) { outfit[slot] = null; continue; }
    items.sort((a, b) =>
      garmentScore(watch, b, weather, history, dayProfile) -
      garmentScore(watch, a, weather, history, dayProfile)
    );
    outfit[slot] = items[0];
  }

  // Sweater layer — separate from shirt, added when temp < 22°C
  outfit.sweater = null;
  const tempC = weather?.tempC ?? 22;
  if (tempC < 22) {
    const sweaters = wearable.filter(g => slotMatches(slotType(g), "sweater"));
    if (sweaters.length) {
      sweaters.sort((a, b) =>
        garmentScore(watch, b, weather, history, dayProfile) -
        garmentScore(watch, a, weather, history, dayProfile)
      );
      outfit.sweater = sweaters[0];
    }
  }

  return outfit;
}

/** Generate a practical, specific explanation string. */
export function explainOutfit(watch, outfit, dayProfile = "smart-casual") {
  const filledSlots = Object.values(outfit).filter(Boolean);
  if (!filledSlots.length) {
    return `No garments in wardrobe yet. Add some and the engine will build around the ${watch.model}.`;
  }

  const profileLabels = {
    "hospital-smart-casual": "hospital-smart-casual day",
    "smart-casual": "smart casual",
    "formal": "formal occasion",
    "casual": "casual day",
    "travel": "travel day",
    "shift": "on-call shift",
  };
  const contextLabel = profileLabels[dayProfile] ?? "today";

  const shirtName = outfit.shirt?.name ?? null;
  const pantsName = outfit.pants?.name ?? null;
  const shoesName = outfit.shoes?.name ?? null;

  const strapLower = (watch.strap ?? "").toLowerCase();
  const activeLabel = watch._activeStrapLabel ?? watch.strap ?? "bracelet";
  const isLeatherStrap = strapLower.includes("leather") || strapLower.includes("alligator")
    || strapLower.includes("calfskin") || strapLower.includes("suede");
  const isNatoStrap = strapLower.includes("nato") || strapLower.includes("canvas") || strapLower.includes("rubber");
  const strapNote = isLeatherStrap
    ? `${activeLabel} — match shoe color accordingly.`
    : isNatoStrap
      ? `${activeLabel} — white sneakers preferred.`
      : `${activeLabel} — shoe color unrestricted.`;

  const parts = [
    `${watch.brand} ${watch.model} anchors a ${contextLabel} look.`,
    shirtName && pantsName ? `${shirtName} + ${pantsName} match dial tone and formality.` : null,
    shoesName ? `${shoesName} complete the formality level.` : null,
    strapNote,
  ].filter(Boolean);

  return parts.join(" ");
}
