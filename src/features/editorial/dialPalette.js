/**
 * Dial palette extraction.
 *
 * Each watch has a `dial` color tag. Map it to a curated 3-color palette
 * (background, accent, ink) that the editorial card uses. Palettes are
 * pre-curated rather than runtime-extracted because:
 *   1. We don't have watch photos to sample from (seed has no imageURLs)
 *   2. Curation lets the designer hand-tune contrast and mood per dial
 *   3. Pure function = trivially testable, no canvas dependency
 *
 * Cache is implicit — pure function with constant input.
 */

// Curated palettes per dial. Each palette: { bg, accent, ink, mood }.
// bg = card background gradient anchor
// accent = serif tagline color + glow
// ink = primary text on bg
// mood = single-word descriptor used by "why" line
const PALETTES = {
  "silver-white": { bg: "#e6e8ea", accent: "#1f2937", ink: "#0f1115", mood: "luminous" },
  "white":        { bg: "#f4f1ec", accent: "#222222", ink: "#0f1115", mood: "clean" },
  "champagne":    { bg: "#f5e9c8", accent: "#8a6d2a", ink: "#3a2c0d", mood: "warm" },
  "green":        { bg: "#1c3a2a", accent: "#b8d4a4", ink: "#f1ece1", mood: "verdant" },
  "grey":         { bg: "#3a3d44", accent: "#cfd2d8", ink: "#f3f4f6", mood: "neutral" },
  "blue":         { bg: "#1f3a6b", accent: "#9ab8e4", ink: "#f3f6fb", mood: "oceanic" },
  "navy":         { bg: "#141d3b", accent: "#9aa8d6", ink: "#eef0fa", mood: "midnight" },
  "black":        { bg: "#1a1a1a", accent: "#cbb88a", ink: "#f5f3ee", mood: "stealth" },
  "black-red":    { bg: "#1a1a1a", accent: "#c0392b", ink: "#f5f3ee", mood: "burgundy" },
  "white-teal":   { bg: "#dfeae6", accent: "#0e6b6b", ink: "#0a2424", mood: "alpine" },
  "teal":         { bg: "#16403e", accent: "#9fd6cf", ink: "#eaf5f3", mood: "deep-sea" },
  "burgundy":     { bg: "#3b1620", accent: "#e2b8a0", ink: "#f6ecea", mood: "vinous" },
  "purple":       { bg: "#321a44", accent: "#d8c4ec", ink: "#f3eaf7", mood: "regal" },
  "turquoise":    { bg: "#0e5a55", accent: "#dff4ef", ink: "#f0fbf8", mood: "tropic" },
  "red":          { bg: "#3a0e0e", accent: "#f0c6c0", ink: "#f7e9e6", mood: "fervent" },
  "meteorite":    { bg: "#3c3a36", accent: "#cfc7b6", ink: "#f4f0e7", mood: "cosmic" },
};

const FALLBACK = { bg: "#1f2937", accent: "#94a3b8", ink: "#f3f4f6", mood: "classic" };

/**
 * Get the editorial palette for a watch.
 * Handles dual-dial watches (uses sideA).
 */
export function paletteForWatch(watch) {
  if (!watch) return FALLBACK;
  const dial = watch.dualDial?.sideA ?? watch.dial ?? watch.dialColor;
  return PALETTES[dial] ?? FALLBACK;
}

/**
 * Compose a one-line "why this watch today" copy.
 * Pure function — no I/O. Pulls signals from weather + day profile.
 *
 * @param {object} watch
 * @param {object} weather { tempC, description }
 * @param {string} context day profile (smart-casual / clinic / formal / casual / shift)
 */
export function composeWhy(watch, weather = null, context = null) {
  if (!watch) return "A quiet day for any watch.";
  const palette = paletteForWatch(watch);
  const t = weather?.tempC;
  const desc = weather?.description?.toLowerCase() ?? "";

  // Weather-led opener
  let weatherFrag;
  if (t == null) {
    weatherFrag = "Today";
  } else if (t < 8) {
    weatherFrag = "On a cold morning";
  } else if (t < 16) {
    weatherFrag = "On a crisp morning";
  } else if (t < 22) {
    weatherFrag = "On a mild day";
  } else if (t < 28) {
    weatherFrag = "On a warm day";
  } else {
    weatherFrag = "Under bright sun";
  }
  if (desc.includes("rain")) weatherFrag = "Through the rain";
  else if (desc.includes("snow")) weatherFrag = "Through the snow";

  // Style-led middle
  const style = watch.style ?? "";
  let styleFrag;
  if (style.includes("dress")) styleFrag = "the dress code answers itself";
  else if (style === "sport") styleFrag = "an honest tool earns its place";
  else if (style === "pilot") styleFrag = "an instrument finds its altitude";
  else if (style.includes("sport-elegant")) styleFrag = "elegance keeps its edge";
  else styleFrag = `the ${palette.mood} dial sets the tone`;

  // Context tail (subtle)
  let ctxTail = "";
  if (context === "formal") ctxTail = " — formal hours ahead.";
  else if (context === "clinic") ctxTail = " — clinic-ready.";
  else if (context === "shift") ctxTail = " — built for the shift.";
  else if (context === "casual") ctxTail = " — off-duty.";
  else ctxTail = ".";

  return `${weatherFrag}, ${styleFrag}${ctxTail}`;
}
