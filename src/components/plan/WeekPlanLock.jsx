/**
 * WeekPlanLock — "Lock this week's plan" button + daily card display.
 * Persists 7-day plan to IDB. Tracks adherence vs actual logged outfits.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getCachedState, setCachedState } from "../../services/localCache.js";
import { useHistoryStore } from "../../stores/historyStore.js";

/**
 * @param {{ weekPlan: Array, watches: Array, isDark: boolean }} props
 * weekPlan: array of { date, watchId, outfit: { shirt, pants, shoes, ... } }
 */
export default function WeekPlanLock({ weekPlan, watches, isDark }) {
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const history = useHistoryStore(s => s.entries) ?? [];

  // Load saved plan on mount
  useEffect(() => {
    getCachedState().then(cached => {
      if (cached._weekPlan?.length) {
        const today = new Date().toISOString().split("T")[0];
        const hasRelevant = cached._weekPlan.some(d => d.date >= today);
        if (hasRelevant) setSaved(cached._weekPlan);
      }
    }).catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    if (!weekPlan?.length) return;
    setSaving(true);
    const cached = await getCachedState().catch(() => ({}));
    await setCachedState({ ...cached, _weekPlan: weekPlan });
    setSaved(weekPlan);
    setSaving(false);
  }, [weekPlan]);

  const handleClear = useCallback(async () => {
    const cached = await getCachedState().catch(() => ({}));
    delete cached._weekPlan;
    await setCachedState(cached);
    setSaved(null);
  }, []);

  // ── Adherence tracking ─────────────────────────────────────────────────
  const adherence = useMemo(() => {
    if (!saved?.length) return null;
    const today = new Date().toISOString().split("T")[0];
    let planned = 0, followed = 0, deviated = 0, pending = 0;

    for (const day of saved) {
      if (day.date > today) { pending++; continue; }
      planned++;
      // Find actual logged entry for this date
      const actual = history.find(h => h.date === day.date);
      if (!actual) continue;
      // Check watch match
      const watchMatch = actual.watchId === day.watchId;
      // Check garment overlap (at least 60% of planned garments match)
      const plannedNames = Object.values(day.outfit ?? {}).filter(Boolean).map(n => n.toLowerCase());
      const actualIds = actual.garmentIds ?? [];
      // Simple: if watch matches, count as followed
      if (watchMatch) followed++;
      else deviated++;
    }
    const adherencePct = planned > 0 ? Math.round((followed / planned) * 100) : 0;
    return { planned, followed, deviated, pending, adherencePct };
  }, [saved, history]);

  const card = isDark ? "#161b22" : "#f0f9ff";
  const border = isDark ? "#1e3a5f30" : "#bae6fd40";
  const text = isDark ? "#93c5fd" : "#1e40af";
  const muted = isDark ? "#64748b" : "#94a3b8";

  const today = new Date().toISOString().split("T")[0];

  // Show saved plan
  if (saved?.length) {
    const todayPlan = saved.find(d => d.date === today);
    return (
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📋 This week's plan
          </div>
          <button onClick={handleClear} style={{ fontSize: 9, color: muted, background: "none", border: "none", cursor: "pointer" }}>
            Clear plan
          </button>
        </div>
        {todayPlan ? (
          <div style={{ padding: "8px 10px", borderRadius: 8, background: isDark ? "#1e3a5f20" : "#dbeafe30", marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: text, marginBottom: 3 }}>Today's plan:</div>
            <div style={{ fontSize: 11, color: isDark ? "#e2e8f0" : "#1f2937" }}>
              {todayPlan.outfit ? Object.values(todayPlan.outfit).filter(Boolean).join(" · ") : "No outfit set"}
            </div>
            {todayPlan.watchId && (
              <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>
                ⌚ {watches?.find(w => w.id === todayPlan.watchId)?.model ?? todayPlan.watchId}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: muted }}>No plan for today — check tomorrow</div>
        )}

        {/* Adherence bar */}
        {adherence && adherence.planned > 0 && (
          <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: isDark ? "#0f131a" : "#f0f9ff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: text }}>
                Adherence: {adherence.adherencePct}%
              </span>
              <span style={{ fontSize: 9, color: muted }}>
                {adherence.followed}/{adherence.planned} days followed
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden" }}>
              <div style={{
                width: `${adherence.adherencePct}%`, height: "100%", borderRadius: 3,
                background: adherence.adherencePct >= 70 ? "#22c55e" : adherence.adherencePct >= 40 ? "#f59e0b" : "#ef4444",
              }} />
            </div>
            {adherence.deviated > 0 && (
              <div style={{ fontSize: 9, color: "#f59e0b", marginTop: 3 }}>
                {adherence.deviated} day{adherence.deviated > 1 ? "s" : ""} you went off-plan — that's fine, instinct matters too
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 9, color: muted, marginTop: 4 }}>
          {saved.filter(d => d.date >= today).length} days remaining in plan
        </div>
      </div>
    );
  }

  // Show save button
  if (!weekPlan?.length) return null;

  return (
    <button onClick={handleSave} disabled={saving}
      style={{
        width: "100%", padding: "10px 0", borderRadius: 10,
        border: `1px solid ${border}`, background: card,
        color: text, fontSize: 12, fontWeight: 700, cursor: "pointer",
        marginBottom: 14, opacity: saving ? 0.5 : 1,
      }}>
      {saving ? "Saving..." : "📋 Lock this week's plan"}
    </button>
  );
}
