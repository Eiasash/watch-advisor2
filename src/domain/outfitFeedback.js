/**
 * outfitFeedback — writes AI selfie-check score back to history.
 * Called after SelfiePanel gets a result, attaches aiScore to today's entry.
 */
import { useHistoryStore } from "../stores/historyStore.js";

/**
 * Write AI impact score to the current day's history entry.
 * @param {string} dateISO - YYYY-MM-DD
 * @param {string} watchId - watch ID for the entry
 * @param {number} aiScore - 1-10 from selfie-check
 * @param {object} aiDetails - optional details (vision, works, risk, upgrade)
 */
export function recordAIFeedback(dateISO, watchId, aiScore, aiDetails = {}) {
  if (!dateISO || !watchId || !aiScore) return;

  const store = useHistoryStore.getState();
  const entryId = `wear-${dateISO}-${watchId}`;
  const existing = store.entries?.find(e => e.id === entryId);
  if (!existing) return;

  store.upsertEntry({
    ...existing,
    aiScore,
    aiVision: aiDetails.vision ?? null,
    aiWorks: aiDetails.works ?? null,
    aiRisk: aiDetails.risk ?? null,
    aiUpgrade: aiDetails.upgrade ?? null,
    aiFeedbackAt: new Date().toISOString(),
  });
}

/**
 * Get score gap between manual rating and AI rating.
 * Positive = you rated higher than AI. Negative = AI rated higher.
 * @param {object} entry - history entry
 * @returns {number|null}
 */
export function scoreGap(entry) {
  if (!entry?.score || !entry?.aiScore) return null;
  return entry.score - entry.aiScore;
}
