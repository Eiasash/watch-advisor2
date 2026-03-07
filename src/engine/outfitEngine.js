/**
 * Outfit engine — slot-based scoring.
 * Slots: shirt, pants, shoes, jacket
 */

// Dial color → compatible garment colors
const DIAL_COLOR_MAP = {
  "silver-white": ["black", "navy", "grey", "white", "beige", "slate"],
  "green":        ["olive", "beige", "brown", "grey", "cream", "khaki"],
  "grey":         ["black", "white", "navy", "grey", "stone", "beige"],
  "blue":         ["navy", "grey", "white", "beige", "stone", "black"],
  "navy":         ["grey", "white", "black", "beige", "stone", "cream"],
  "white":        ["black", "navy", "grey", "beige", "stone", "brown"],
  "black-red":    ["black", "grey", "white", "red"],
  "black":        ["black", "white", "grey", "navy", "olive", "brown"],
  "white-teal":   ["grey", "white", "black", "navy", "teal"],
  // Replica dial colors
  "teal":         ["grey", "white", "black", "navy", "olive", "khaki"],
  "burgundy":     ["grey", "white", "navy", "black", "beige", "stone"],
  "purple":       ["grey", "black", "navy", "white", "stone"],
  "turquoise":    ["white", "beige", "stone", "navy", "cream"],
  "red":          ["black", "grey", "white", "navy"],
  "meteorite":    ["black", "grey", "navy", "white", "brown"],
};

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
  const strap = watch.strap ?? "";
  // Leather/alligator strap → favour earth tones to enforce strap-shoe matching
  if (strap === "alligator" || strap === "leather") {
    const earthTones = ["brown", "tan", "black", "cognac", "beige"];
    if (garment.type === "shoes") {
      return earthTones.includes(garment.color?.toLowerCase()) ? 1 : 0.4;
    }
    return 0.7;
  }
  // Bracelet / integrated → neutral, no restriction
  return 0.75;
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

export function garmentScore(watch, garment, weather, history) {
  return (
    0.30 * formalityScore(watch, garment) +
    0.25 * colorScore(watch, garment) +
    0.15 * strapScore(watch, garment) +
    0.10 * weatherScore(garment, weather) +
    0.20 * (1 + diversityPenalty(garment, history))
  );
}

export function generateOutfit(watch, wardrobe, weather = {}, _profile = {}, history = []) {
  const slots = ["shirt", "pants", "shoes", "jacket"];
  const outfit = {};
  for (const slot of slots) {
    const items = wardrobe.filter(g => g.type === slot);
    if (!items.length) { outfit[slot] = null; continue; }
    items.sort((a, b) =>
      garmentScore(watch, b, weather, history) -
      garmentScore(watch, a, weather, history)
    );
    outfit[slot] = items[0];
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
  };
  const contextLabel = profileLabels[dayProfile] ?? "today";

  const shirtName = outfit.shirt?.name ?? null;
  const pantsName = outfit.pants?.name ?? null;
  const shoesName = outfit.shoes?.name ?? null;

  const strapNote = watch.strap === "leather" || watch.strap === "alligator"
    ? `Leather strap — confirm shoe color matches.`
    : `Bracelet — shoe color is unrestricted.`;

  const parts = [
    `${watch.brand} ${watch.model} anchors a ${contextLabel} look.`,
    shirtName && pantsName ? `${shirtName} + ${pantsName} match dial tone and formality.` : null,
    shoesName ? `${shoesName} complete the formality level.` : null,
    strapNote,
  ].filter(Boolean);

  return parts.join(" ");
}
