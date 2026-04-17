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

import { daysIdle } from "../domain/rotationStats.js";
import { recentWatchIds } from "../domain/historyWindow.js";

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
  "clinic",
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
 * Cooldown multiplier based on days since last wear.
 * Fresh watches are penalised; watches rested 7+ days get a small boost.
 * Undefined = never worn → treat as fully rested (1.0).
 */
function watchCooldownScore(daysSinceWear) {
  if (daysSinceWear === undefined) return 1;
  if (daysSinceWear <= 1) return 0.4;
  if (daysSinceWear === 2) return 0.6;
  if (daysSinceWear === 3) return 0.8;
  if (daysSinceWear >= 7) return 1.15;
  return 1; // 4–6 days: neutral
}

/**
 * Deterministic daily jitter — gives each watch a small daily-varying offset
 * so that ties are broken differently each day instead of by array position.
 * Uses a simple hash of (watchId + dateString) mapped to [0, 0.009).
 * Tiny enough to only affect ties, never override real score differences.
 */
export function dailyJitter(watchId, dateStr) {
  let h = 0;
  const s = watchId + dateStr;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 111112; // 0..~0.009
}

// Profiles where pilot/field watches with low formality are inappropriate
// (Laco formality 5 should never appear in clinic or shift recommendations)
const PILOT_FORMALITY_FLOOR = {
  "hospital-smart-casual": 6,
  "shift":                 6,
  "formal":                8,
};

/**
 * Score a single watch for a day profile and recent history.
 * Penalizes replicas in clinic / formal / shift contexts.
 * Hard-excludes low-formality pilot watches from professional profiles.
 * Adds daily jitter to break ties so the same watch doesn't always win.
 */
export function scoreWatchForDay(watch, dayProfile, history = []) {
  if (watch.retired || watch.pending) return 0;

  // Shift context: only watches explicitly flagged as shift-appropriate score.
  // Prevents precious/dress pieces (Snowflake, Pasha, Reverso, etc.) from
  // appearing on on-call shift days. shiftWatch set on: BB41, Speedmaster, Hanhart.
  if (dayProfile === "shift" && !watch.shiftWatch) return 0;

  const targetFormality = TARGET_FORMALITY[dayProfile] ?? 6;
  const suitableStyles = STYLE_SUITABILITY[dayProfile] ?? [];

  // Hard gate: pilot watches below the profile formality floor score 0.
  // Prevents Laco (formality 5) from appearing in shift/hospital recommendations.
  const pilotFloor = PILOT_FORMALITY_FLOOR[dayProfile];
  if (pilotFloor && watch.style === "pilot" && (watch.formality ?? 5) < pilotFloor) {
    return 0;
  }

  // Formality closeness: max score when diff=0, zero at diff>=4
  const formalityDiff = Math.abs((watch.formality ?? 5) - targetFormality);
  const formalityScore = Math.max(0, 1 - formalityDiff / 4);

  // Style suitability
  const styleScore = suitableStyles.includes(watch.style) ? 1 : 0.3;

  // Recency + rotation: worn in last 7? hard penalise.
  // v2 fix (March 2026): old model used binary 0/1 recencyScore. This caused
  // never-worn watches (daysIdle=Infinity) to score 1.0 every day forever,
  // permanently beating any watch worn more than 7 days ago.
  // New model uses continuous pressure so idle watches cycle naturally:
  //   - Worn today/yesterday → 0.0 (penalised)
  //   - Worn 7 days ago      → 0.5 (moderate, can still win)
  //   - Worn 14+ days ago    → 1.0 (full pressure, prioritised)
  //   - Never worn           → 0.75 (high but capped — first wear encouraged
  //                                  without permanently dominating rotation)
  const recentIds = recentWatchIds(history, 7);
  const todayStr = new Date().toISOString().slice(0, 10);
  const idle = daysIdle(watch.id, history);
  let recencyScore;
  if (recentIds.has(watch.id)) {
    recencyScore = 0; // worn recently — hard penalty
  } else if (!Number.isFinite(idle)) {
    recencyScore = 0.50; // never worn — moderate nudge, not aggressive push (April 2026: was 0.75)
  } else {
    recencyScore = Math.min(idle / 14, 1.0); // linear 0→1 over 14 days
  }

  // Cooldown: use canonical daysIdle from domain layer.
  const daysSinceWear = isFinite(idle) ? idle : 14; // treat never-worn as 14 days idle
  const cooldown = watchCooldownScore(daysSinceWear);

  // Replica penalty: strong penalty in professional contexts
  const replicaPenalty = (watch.replica && GENUINE_PREFERRED_PROFILES.has(dayProfile)) ? -0.5 : 0;

  let score = 0.4 * formalityScore + 0.35 * styleScore + 0.25 * recencyScore + replicaPenalty;
  score *= cooldown;

  // Daily jitter to prevent same watch always winning ties
  score += dailyJitter(watch.id, todayStr);

  // Extra jitter when history is empty — all watches get identical recencyScore
  // so seed-array order dominates. A second jitter hash (~0.045 range) is big
  // enough to vary daily picks without overriding formality/style differences.
  if (history.length === 0) {
    score += dailyJitter(watch.id, todayStr + "x") * 5;
  }

  return score;
}
