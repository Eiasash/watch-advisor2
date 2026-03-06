function formalityScore(watch, garment) {
  const diff = Math.abs((watch.formality || 5) - (garment.formality || 5));
  return Math.max(0, 1 - diff / 5);
}

function colorScore(watch, garment) {
  const map = {
    "silver-white": ["black", "navy", "grey", "beige"],
    "green": ["olive", "beige", "brown", "grey"],
    "grey": ["black", "white", "navy", "grey"],
    "blue": ["navy", "grey", "white", "beige"],
    "navy": ["grey", "white", "black", "beige"],
    "white": ["black", "navy", "grey", "beige"],
    "black-red": ["black", "grey", "white"],
    "black": ["black", "white", "grey", "navy", "olive"],
    "white-teal": ["grey", "white", "black", "navy"]
  };
  return map[watch.dial]?.includes(garment.color) ? 1 : 0.45;
}

function strapScore(watch, garment) {
  if (!watch.strap) return 0.5;
  if (watch.strap === "alligator" || watch.strap === "leather") {
    return ["brown", "black", "tan"].includes(garment.color) ? 1 : 0.55;
  }
  return 0.7;
}

function diversityPenalty(garment, history) {
  const repeated = history.slice(-5).some(entry => Object.values(entry.outfit || {}).includes(garment.id));
  return repeated ? -0.2 : 0;
}

export function garmentScore(watch, garment, weather, profile, history) {
  const weatherScore = weather?.tempC > 24 && garment.type === "jacket" ? 0.2 : 0.8;
  return (
    0.30 * formalityScore(watch, garment) +
    0.25 * colorScore(watch, garment) +
    0.15 * strapScore(watch, garment) +
    0.10 * weatherScore +
    0.20 * (1 + diversityPenalty(garment, history))
  );
}

export function generateOutfit(watch, wardrobe, weather, profile, history=[]) {
  const slots = ["shirt", "pants", "shoes", "jacket"];
  const outfit = {};
  for (const slot of slots) {
    const items = wardrobe.filter(g => g.type === slot);
    items.sort((a, b) => garmentScore(watch, b, weather, profile, history) - garmentScore(watch, a, weather, profile, history));
    outfit[slot] = items[0] || null;
  }
  return outfit;
}

export function explainOutfit(watch, outfit) {
  const names = Object.values(outfit).filter(Boolean).map(x => x.name);
  if (!names.length) return `No full outfit yet. Add garments and the app will build around the ${watch.model}.`;
  return `Built around the ${watch.model}. Chosen pieces respect dial color harmony, watch formality, and strap compatibility.`;
}
