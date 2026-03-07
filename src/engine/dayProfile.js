/**
 * Day profile engine.
 * Infers a day profile from calendar events + weather,
 * then scores watches against that profile.
 *
 * "shift" = on-call hospital night / weekend duty:
 *   - genuine only (replica penalty applied here)
 *   - smart-casual formality (7)
 *   - sport-elegant / dress-sport preferred
 */

export const DAY_PROFILES = ["hospital-smart-casual", "smart-casual", "formal", "casual", "travel", "shift"];

const EVENT_KEYWORDS = {
  "hospital-smart-casual": ["hospital", "ward", "rounds", "consult", "clinic", "medical", " er ", "icu", "patient", "duty"],
  formal: ["wedding", "gala", "black tie", "black-tie", "ceremony", "formal dinner", "evening dinner", "dinner party"],
  casual: ["gym", "run", "hike", "beach", "workout", "training"],
  travel: ["travel", "flight", "airport", "conference", "trip"],
  shift: ["on-call", "oncall", "night shift", "night duty", "call night"],
};

const TARGET_FORMALITY = {
  casual: 5,
  "smart-casual": 6,
  "hospital-smart-casual": 7,
  formal: 9,
  travel: 5,
  shift: 7,   // on-call = clinic-level formality
};

const STYLE_SUITABILITY = {
  "hospital-smart-casual": ["sport-elegant", "dress-sport", "sport"],
  formal: ["dress", "dress-sport"],
  casual: ["sport", "pilot"],
  "smart-casual": ["sport-elegant", "sport", "dress-sport"],
  travel: ["sport", "pilot"],
  shift: ["sport-elegant", "dress-sport", "sport"],
};

// Profiles where replicas are strongly discouraged
const GENUINE_PREFERRED_PROFILES = new Set([
  "hospital-smart-casual",
  "formal",
  "shift",
]);

/**
 * Infer a day profile from events and optional weather.
 * @param {string[]} events - list of event titles/descriptions
 * @param {{ tempC?: number }} weather
 * @returns {string} day profile key
 */
export function inferDayProfile(events = [], weather = {}) {
  if (!events.length) return "smart-casual";

  const combined = events.map(e => e.toLowerCase()).join(" ");

  for (const [profile, keywords] of Object.entries(EVENT_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) return profile;
  }

  return "smart-casual";
}

/**
 * Score a single watch for a day profile and recent history.
 * Penalizes replicas in clinic / formal / shift contexts.
 */
export function scoreWatchForDay(watch, dayProfile, history = []) {
  const targetFormality = TARGET_FORMALITY[dayProfile] ?? 6;
  const suitableStyles = STYLE_SUITABILITY[dayProfile] ?? [];

  // Formality closeness: max score when diff=0, zero at diff>=4
  const formalityDiff = Math.abs((watch.formality ?? 5) - targetFormality);
  const formalityScore = Math.max(0, 1 - formalityDiff / 4);

  // Style suitability
  const styleScore = suitableStyles.includes(watch.style) ? 1 : 0.3;

  // Recency penalty: worn in last 7? penalise.
  const recentIds = new Set(history.slice(-7).map(h => h.watchId));
  const recencyScore = recentIds.has(watch.id) ? 0 : 1;

  // Replica penalty: strong penalty in professional contexts
  const replicaPenalty = (watch.replica && GENUINE_PREFERRED_PROFILES.has(dayProfile)) ? -0.5 : 0;

  return 0.4 * formalityScore + 0.35 * styleScore + 0.25 * recencyScore + replicaPenalty;
}
