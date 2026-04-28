import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useStrapStore }   from "../stores/strapStore.js";
import { normalizeType } from "../classifier/normalizeType.js";
import { useThemeStore } from "../stores/themeStore.js";
import { genWeekRotation } from "../engine/weekRotation.js";
import { buildOutfit } from "../outfitEngine/outfitBuilder.js";

import { setCachedState } from "../services/localCache.js";
import { fetchWeatherForecast, getLayerRecommendation, getLayerTransition } from "../weather/weatherService.js";
import WeekPlanLock from "./plan/WeekPlanLock.jsx";

const CONTEXTS = [
  { key: null,                      label:"Any Vibe" },
  { key:"smart-casual",            label:"Smart Casual" },

  { key:"casual",                  label:"Casual" },
  { key:"date-night",             label:"Date Night" },
  { key:"shift",                   label:"On-Call Shift" },
  { key:"eid-celebration",         label:"Eid" },
  { key:"family-event",            label:"Family Event" },
];

const OUTFIT_SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
const SLOT_ICONS = { shirt:"\u{1F454}", sweater:"\u{1FAA2}", layer:"\u{1F9E3}", pants:"\u{1F456}", shoes:"\u{1F45F}", jacket:"\u{1F9E5}", belt:"\u{1FAA2}" };
const ACCESSORY_TYPES = new Set(["sunglasses","hat","scarf","bag","accessory","outfit-photo","outfit-shot"]);

const WEATHER_ICONS = {
  "Clear sky": "\u2600\uFE0F",
  "Partly cloudy": "\u26C5",
  "Foggy": "\u{1F32B}\uFE0F",
  "Rain": "\u{1F327}\uFE0F",
  "Snow": "\u{1F328}\uFE0F",
  "Thunderstorm": "\u26C8\uFE0F",
};

/** Compute days since a watch was last worn */
function daysSinceWorn(watchId, history) {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < history.length; i++) {
    if (history[i].watchId === watchId) {
      const d = history[i].date;
      if (!d) continue;
      return Math.round((new Date(today) - new Date(d)) / 86400000);
    }
  }
  return null;
}

function WatchMini({ watch, label, isDark, isOnCall, daysSince }) {
  if (!watch) return <div style={{ color:"#4b5563", fontSize:12, fontStyle:"italic" }}>No watches</div>;
  const accent = isOnCall ? "#f97316" : "#3b82f6";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{
        width:36, height:36, borderRadius:"50%", flexShrink:0,
        background:`radial-gradient(circle at 35% 35%, ${accent}44, ${accent}11)`,
        border:`2px solid ${accent}55`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:16,
      }}>
        {watch.emoji ?? "\u231A"}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, fontWeight:700, color:isDark?"#e2e8f0":"#111827", lineHeight:1.2 }}>
          {watch.brand ?? ""} {watch.model ?? watch.name ?? "Watch"}
        </div>
        <div style={{ fontSize:10, color:isDark?"#6b7280":"#9ca3af", display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
          <span>{watch.dualDial ? `${watch.dualDial.sideA}/${watch.dualDial.sideB}` : (watch.dial ?? "")} dial</span>
          <span style={{
            padding:"1px 5px", borderRadius:4, fontSize: 11, fontWeight:700,
            background: watch.replica ? "#78350f22" : "#14532d22",
            color:       watch.replica ? "#f59e0b"   : "#22c55e",
          }}>{watch.replica ? "replica" : "genuine"}</span>
          {label && <span style={{ color:accent }}>{label}</span>}
        </div>
      </div>
      {daysSince !== undefined && daysSince !== null && (
        <div style={{ fontSize:10, fontWeight:700, flexShrink:0,
                      color: daysSince >= 7 ? "#22c55e" : daysSince <= 2 ? "#ef4444" : (isDark?"#6b7280":"#9ca3af") }}>
          {daysSince === 0 ? "today" : `${daysSince}d`}
        </div>
      )}
    </div>
  );
}

/**
 * AiFlexRow — flexibility chips below an AI-applied outfit in the WeekPlanner.
 * Verbs: regenerate, more casual, more formal, different watch, why this, reject + reason.
 * Lives next to the day card so the user can refine the AI's pick without nuking it.
 */
function AiFlexRow({ date, dayForecast, border, isDark, loading, rationale, lastPick, onAsk, onWhy }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const accent = "#8b5cf6";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const bg = isDark ? "#0f131a" : "#f8fafc";
  const text = isDark ? "#e2e8f0" : "#1f2937";

  const chip = (testid, label, onClick) => (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={loading}
      style={{
        fontSize: 10, padding: "3px 9px", borderRadius: 999, cursor: loading ? "wait" : "pointer",
        border: `1px solid ${border}`, background: "transparent", color: muted, fontWeight: 600,
        opacity: loading ? 0.5 : 1,
      }}
    >{label}</button>
  );

  const submitReject = () => {
    setRejectOpen(false);
    const r = reason.trim();
    setReason("");
    if (lastPick) {
      onAsk(date, dayForecast, { rejected: { outfit: lastPick, reason: r }, useExclude: true });
    }
  };

  return (
    <div data-testid={`ai-flex-row-${date}`} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>
          ✦ Refine
        </span>
        {chip(`ai-regen-${date}`, loading ? "..." : "Different one →", () => onAsk(date, dayForecast, { useExclude: true }))}
        {chip(`ai-steer-casual-${date}`, "↓ More casual", () => onAsk(date, dayForecast, { steer: "more_casual", useExclude: true }))}
        {chip(`ai-steer-formal-${date}`, "↑ More formal", () => onAsk(date, dayForecast, { steer: "more_formal", useExclude: true }))}
        {chip(`ai-steer-watch-${date}`, "⌚ Different watch", () => onAsk(date, dayForecast, { steer: "different_watch", useExclude: true }))}
        {chip(`ai-why-${date}`, rationale?.loading ? "…" : (rationale?.text ? "Hide why" : "Why this?"), onWhy)}
        {chip(`ai-reject-${date}`, "👎", () => setRejectOpen(v => !v))}
      </div>
      {rejectOpen && (
        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
          <input
            data-testid={`ai-reject-reason-${date}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why doesn't this work? (optional)"
            style={{
              flex: 1, padding: "5px 8px", borderRadius: 5, fontSize: 11,
              background: bg, color: text, border: `1px solid ${border}`,
            }}
          />
          <button
            data-testid={`ai-reject-submit-${date}`}
            onClick={submitReject}
            style={{
              padding: "5px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700,
              background: "#ef4444", color: "#fff", border: "none", cursor: "pointer",
            }}
          >Send + retry</button>
        </div>
      )}
      {rationale?.text && (
        <div style={{
          marginTop: 6, padding: "6px 9px", borderRadius: 6,
          background: isDark ? "#1a1040" : "#f5f3ff",
          border: `1px solid ${accent}33`,
          fontSize: 10, color: isDark ? "#c4b5fd" : "#7c3aed", lineHeight: 1.5,
        }}>
          <strong>Why:</strong> {rationale.text}
        </div>
      )}
    </div>
  );
}

/** Rotation insights: variety score + most/least worn */
function RotationInsights({ rotation, history, isDark }) {
  if (!rotation.length) return null;
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const sub = isDark ? "#6b7280" : "#9ca3af";

  // Count unique watches in the 7-day plan
  const weekWatchIds = new Set(rotation.map(d => d.watch?.id).filter(Boolean));
  const varietyScore = weekWatchIds.size;

  // Wear frequency in last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const recentHistory = history.filter(e => e.date >= cutoffIso && e.watchId);
  const wearCounts = {};
  for (const e of recentHistory) {
    wearCounts[e.watchId] = (wearCounts[e.watchId] ?? 0) + 1;
  }

  // Most and least worn from the week's watches
  const weekWatches = rotation.map(d => d.watch).filter(Boolean);
  const uniqueWeek = [...new Map(weekWatches.map(w => [w.id, w])).values()];
  let mostWorn = null, leastWorn = null;
  for (const w of uniqueWeek) {
    const c = wearCounts[w.id] ?? 0;
    if (!mostWorn || c > (wearCounts[mostWorn.id] ?? 0)) mostWorn = w;
    if (!leastWorn || c < (wearCounts[leastWorn.id] ?? 0)) leastWorn = w;
  }

  // Style streak detection: same watch style 3+ consecutive days
  let streak = 1, maxStreak = 1, streakStyle = null;
  for (let i = 1; i < rotation.length; i++) {
    if (rotation[i].watch?.style && rotation[i].watch?.style === rotation[i - 1].watch?.style) {
      streak++;
      if (streak > maxStreak) { maxStreak = streak; streakStyle = rotation[i].watch.style; }
    } else {
      streak = 1;
    }
  }

  return (
    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
      <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                    border:`1px solid ${border}`, fontSize:11, color:text }}>
        <span style={{ fontWeight:700, color: varietyScore >= 5 ? "#22c55e" : varietyScore >= 3 ? "#f59e0b" : "#ef4444" }}>
          {varietyScore}
        </span>
        <span style={{ color:sub }}> unique watches this week</span>
      </div>
      {mostWorn && (wearCounts[mostWorn.id] ?? 0) > 0 && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                      border:`1px solid ${border}`, fontSize:11, color:sub }}>
          Most worn: <span style={{ fontWeight:700, color:text }}>{mostWorn.model}</span> ({wearCounts[mostWorn.id] ?? 0}x/30d)
        </div>
      )}
      {leastWorn && leastWorn.id !== mostWorn?.id && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:isDark?"#0f131a":"#f3f4f6",
                      border:`1px solid ${border}`, fontSize:11, color:sub }}>
          Rested: <span style={{ fontWeight:700, color:"#22c55e" }}>{leastWorn.model}</span> ({wearCounts[leastWorn.id] ?? 0}x/30d)
        </div>
      )}
      {maxStreak >= 3 && (
        <div style={{ padding:"6px 12px", borderRadius:8, background:"#7f1d1d22",
                      border:"1px solid #ef444444", fontSize:11, color:"#ef4444" }}>
          {"\u26A0"} {streakStyle} streak: {maxStreak} days in a row
        </div>
      )}
    </div>
  );
}

// ── Image resize helper ──────────────────────────────────────────────────────
function resizeImage(file, maxPx = 600) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Log Confirm Modal — notes + photo before committing "Wear This Outfit" ───
function LogConfirmModal({ isDark, onConfirm, onCancel }) {
  const [notes,    setNotes]    = useState("");
  const [photos,   setPhotos]   = useState([]);
  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const thumbs = await Promise.all(files.map(f => resizeImage(f, 600)));
    setPhotos(prev => [...prev, ...thumbs]);
    e.target.value = "";
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom,0)",
    }}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: bg, borderRadius: "20px 20px 0 0",
        border: `1px solid ${border}`, padding: "20px 16px 28px",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 14 }}>
          Log Outfit
        </div>

        {/* Notes */}
        <textarea
          placeholder="Notes (optional) — e.g. coat buttoned, clinic day…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          style={{
            width: "100%", background: isDark ? "#0f131a" : "#f9fafb",
            border: `1px solid ${border}`, borderRadius: 10,
            padding: "10px 12px", color: text, fontSize: 13,
            resize: "none", fontFamily: "inherit", boxSizing: "border-box",
            outline: "none", marginBottom: 12,
          }}
        />

        {/* Photo buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: photos.length ? 10 : 0 }}>
          <label style={{
            flex: 1, padding: "9px 0", borderRadius: 10,
            border: `1px dashed ${border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, cursor: "pointer", color: muted, fontSize: 12,
          }}>
            📁 Gallery
            <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
          </label>
          <label style={{
            flex: 1, padding: "9px 0", borderRadius: 10,
            border: `1px dashed ${border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, cursor: "pointer", color: muted, fontSize: 12,
          }}>
            📷 Camera
            <input type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={handleFiles} />
          </label>
        </div>

        {/* Photo previews */}
        {photos.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 6, marginBottom: 12,
          }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1/1" }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button
                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  style={{
                    position: "absolute", top: 3, right: 3,
                    background: "#ef4444", color: "#fff",
                    border: "none", borderRadius: "50%", width: 18, height: 18,
                    fontSize: 11, cursor: "pointer", lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              border: `1px solid ${border}`, background: "transparent",
              color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ notes: notes.trim() || null, photos })}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 10,
              border: "none", background: "#22c55e",
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
            ✓ Log It
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Another Outfit Modal — second/evening outfit with time slot + watch picker ──
const TIME_SLOTS = [
  { key: "morning",   label: "Morning",   emoji: "🌅" },
  { key: "afternoon", label: "Afternoon", emoji: "☀️" },
  { key: "evening",   label: "Evening",   emoji: "🌆" },
  { key: "night",     label: "Night",     emoji: "🌙" },
];

function AddOutfitModal({ isDark, watches, garments, day, forecast, history, wearable, slotCandidates, onConfirm, onCancel }) {
  const [timeSlot,  setTimeSlot]  = useState("evening");
  const [watchId,   setWatchId]   = useState(day?.watch?.id ?? watches.find(w => !w.retired && !w.pending)?.id ?? null);
  const [notes,     setNotes]     = useState("");
  const [outfitSlots, setOutfitSlots] = useState({});
  const [slotOverrides, setSlotOverrides] = useState({});
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [context, setContext]     = useState(day?.ctx ?? null);
  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const sub    = isDark ? "#94a3b8" : "#64748b";

  const selectedWatch = watches.find(w => w.id === watchId);

  const CONTEXTS = [null,"smart-casual","casual","date-night","eid-celebration","family-event","riviera","shift"];
  const CONTEXT_LABELS = { [null]: "Any Vibe", "smart-casual": "Smart Casual", casual: "Casual", "date-night": "Date Night", "eid-celebration": "Eid", "family-event": "Family", riviera: "Riviera", shift: "On-Call" };

  // Build outfit with shuffle + pin support — same pattern as WatchDashboard
  const dayWeather = useMemo(() => {
    const dayForecast = forecast?.find(f => f.date === day?.date);
    return dayForecast ? { tempC: dayForecast.tempC } : { tempC: 22 };
  }, [forecast, day?.date]);

  useEffect(() => {
    if (!selectedWatch || !wearable?.length) {
      setOutfitSlots({});
      return;
    }
    try {
      const shuffleExcluded = {};
      for (const slot of OUTFIT_SLOTS) shuffleExcluded[slot] = new Set();
      const hasPins = Object.keys(slotOverrides).length > 0;
      let result = {};
      let iterHistory = [...(history ?? [])];
      for (let round = 0; round <= shuffleSeed; round++) {
        result = buildOutfit(selectedWatch, wearable, dayWeather, iterHistory, [], hasPins ? slotOverrides : {}, shuffleExcluded, context);
        if (round < shuffleSeed) {
          const combined = { outfit: {} };
          const allIds = [];
          for (const slot of OUTFIT_SLOTS) {
            if (result[slot]?.id) {
              combined.outfit[slot] = result[slot].id;
              allIds.push(result[slot].id);
              shuffleExcluded[slot].add(result[slot].id);
            }
          }
          combined.garmentIds = allIds;
          for (let i = 0; i < 5; i++) iterHistory.push(combined);
        }
      }
      const slots = {};
      for (const slot of OUTFIT_SLOTS) {
        if (result[slot]) slots[slot] = result[slot];
      }
      // Merge overrides on top — engine already adapted other slots to pins
      setOutfitSlots({ ...slots, ...slotOverrides });
    } catch (_e) {
      setOutfitSlots({});
    }
  }, [watchId, selectedWatch, wearable, history, context, shuffleSeed, slotOverrides, dayWeather]);

  const handleSlotSwap = (slot, garment) => {
    if (garment) {
      setSlotOverrides(prev => ({ ...prev, [slot]: garment }));
    } else {
      setSlotOverrides(prev => { const n = { ...prev }; delete n[slot]; return n; });
    }
  };

  const hasCustomizations = Object.keys(slotOverrides).length > 0 || shuffleSeed > 0;

  const garmentIds = OUTFIT_SLOTS.map(s => outfitSlots[s]?.id).filter(Boolean);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 env(safe-area-inset-bottom,0)",
    }}>
      <div style={{
        width: "100%", maxWidth: 480,
        background: bg, borderRadius: "20px 20px 0 0",
        border: `1px solid ${border}`, padding: "20px 16px 28px",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 6 }}>
          + Add Another Outfit
        </div>
        <div style={{ fontSize: 11, color: muted, marginBottom: 16 }}>
          {day?.dateLabel ?? day?.date} — second outfit for this day
        </div>

        {/* Time slot */}
        <div style={{ fontSize: 11, fontWeight: 600, color: sub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Time of Day
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {TIME_SLOTS.map(ts => (
            <button key={ts.key}
              onClick={() => setTimeSlot(ts.key)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${timeSlot === ts.key ? "#3b82f6" : border}`,
                background: timeSlot === ts.key ? "#3b82f622" : "transparent",
                color: timeSlot === ts.key ? "#3b82f6" : muted,
                fontSize: 11, fontWeight: 600, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 2,
              }}>
              <span style={{ fontSize: 16 }}>{ts.emoji}</span>
              {ts.label}
            </button>
          ))}
        </div>

        {/* Context */}
        <div style={{ fontSize: 11, fontWeight: 600, color: sub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Context
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
          {CONTEXTS.map(c => (
            <button key={c ?? "__any"} onClick={() => { setContext(c); setShuffleSeed(0); setSlotOverrides({}); }}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${context === c ? "#3b82f6" : border}`,
                background: context === c ? "#3b82f622" : "transparent",
                color: context === c ? "#3b82f6" : muted,
              }}>
              {CONTEXT_LABELS[c] ?? c}
            </button>
          ))}
        </div>

        {/* Watch picker */}
        <div style={{ fontSize: 11, fontWeight: 600, color: sub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Watch
        </div>
        <div style={{ border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", maxHeight: 200, overflowY: "auto", marginBottom: 16 }}>
          {watches.filter(w => !w.retired && !w.pending).map(w => {
            const isSelected = watchId === w.id;
            return (
              <div key={w.id}
                onClick={() => { setWatchId(w.id); setShuffleSeed(0); setSlotOverrides({}); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer",
                  background: isSelected ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                  borderBottom: `1px solid ${border}`,
                }}>
                <span style={{ fontSize: 16 }}>{w.emoji ?? "⌚"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                  <div style={{ fontSize: 10, color: muted }}>{w.dial} · {w.replica ? "replica" : "genuine"}</div>
                </div>
                {isSelected && <span style={{ color: "#3b82f6", fontWeight: 700 }}>✓</span>}
              </div>
            );
          })}
        </div>

        {/* Outfit slots + shuffle + reset */}
        {garmentIds.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Outfit
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {hasCustomizations && (
                  <button
                    onClick={() => { setSlotOverrides({}); setShuffleSeed(0); }}
                    title="Reset slot overrides + shuffle for this outfit"
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                      cursor: "pointer", border: `1px solid ${border}`,
                      background: "transparent", color: muted,
                    }}>
                    ↺ Reset outfit
                  </button>
                )}
                <button
                  onClick={() => { setShuffleSeed(s => s + 1); setSlotOverrides({}); }}
                  title="Shuffle to next best outfit"
                  style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                    border: `1px solid ${shuffleSeed > 0 ? "#6366f1" : border}`,
                    background: shuffleSeed > 0 ? "#6366f122" : "transparent",
                    color: shuffleSeed > 0 ? "#6366f1" : muted,
                  }}>
                  🔀 {shuffleSeed > 0 ? `#${shuffleSeed + 1}` : "Shuffle"}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
              {OUTFIT_SLOTS.map(slot => (
                <OutfitSlotChip
                  key={slot}
                  slot={slot}
                  garment={outfitSlots[slot]}
                  isDark={isDark}
                  border={border}
                  isOverridden={!!slotOverrides[slot]}
                  candidates={slotCandidates?.[slot] ?? []}
                  onSwap={(s, g) => {
                    if (g) {
                      handleSlotSwap(s, g);
                    } else {
                      // Unpin — remove override so engine re-picks
                      setSlotOverrides(prev => { const n = { ...prev }; delete n[s]; return n; });
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Notes */}
        <textarea
          placeholder="Notes (optional) — e.g. Eid evening, date night…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          style={{
            width: "100%", background: isDark ? "#0f131a" : "#f9fafb",
            border: `1px solid ${border}`, borderRadius: 10,
            padding: "10px 12px", color: text, fontSize: 13,
            resize: "none", fontFamily: "inherit", boxSizing: "border-box",
            outline: "none", marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={onCancel}
            style={{
              flex: 1, padding: "11px 0", borderRadius: 10,
              border: `1px solid ${border}`, background: "transparent",
              color: muted, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ timeSlot, watchId, notes: notes.trim() || null, garmentIds, context })}
            disabled={!watchId}
            style={{
              flex: 2, padding: "11px 0", borderRadius: 10,
              border: "none", background: watchId ? "#3b82f6" : "#374151",
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: watchId ? "pointer" : "default",
            }}>
            + Log Outfit {garmentIds.length > 0 && `(${garmentIds.length} items)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Photo Lightbox — full-screen zoom on tap ────────────────────────────────
function PhotoLightbox({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, cursor: "zoom-out",
      }}
    >
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          maxWidth: "92vw", maxHeight: "85vh",
          borderRadius: 12, objectFit: "contain",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      />
      <div style={{
        position: "absolute", top: 16, right: 20,
        color: "#fff", fontSize: 28, fontWeight: 300,
        cursor: "pointer", lineHeight: 1,
        padding: "4px 10px",
      }}>{"\u00D7"}</div>
      {alt && (
        <div style={{
          position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center",
          color: "#e2e8f0", fontSize: 14, fontWeight: 600,
          textShadow: "0 1px 4px rgba(0,0,0,0.7)",
        }}>{alt}</div>
      )}
    </div>
  );
}

// ── Outfit Slot Chip — tap to swap garment, long-press photo to zoom ────────
function OutfitSlotChip({ slot, garment, isDark, border, onSwap, candidates = [], isOverridden = false }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const icon = SLOT_ICONS[slot] ?? "\u2022";
  const sub = isDark ? "#6b7280" : "#9ca3af";
  const photo = garment?.thumbnail || garment?.photoUrl;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => candidates.length > 0 && setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 8,
          border: `1px solid ${isOverridden ? "#6366f1" : border}`,
          borderLeft: isOverridden ? "3px solid #6366f1" : `1px solid ${border}`,
          background: isDark ? "#0f131a" : "#f9fafb",
          cursor: candidates.length > 0 ? "pointer" : "default",
          minHeight: 36,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={garment.name ?? ""}
            onClick={e => { e.stopPropagation(); setLightbox({ src: photo, alt: `${garment.color ?? ""} ${garment.type ?? ""}`.trim() }); }}
            style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover", cursor: "zoom-in" }}
          />
        ) : (
          <span style={{ fontSize: 16, width: 28, textAlign: "center" }}>{icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>{slot}</div>
          {garment ? (
            <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {garment.color} {garment.type}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: sub, fontStyle: "italic" }}>None</div>
          )}
        </div>
        {candidates.length > 0 && (
          <span style={{ fontSize: 10, color: sub }}>{open ? "\u25B2" : "\u25BC"}</span>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          maxHeight: 180, overflowY: "auto",
          background: isDark ? "#171a21" : "#fff",
          border: `1px solid ${border}`, borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          {/* Clear / None option */}
          <div
            onClick={() => { onSwap(slot, null); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 10px", cursor: "pointer",
              background: !garment ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
              borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
              color: isDark ? "#6b7280" : "#9ca3af", fontStyle: "italic", fontSize: 11,
            }}
          >
            <span style={{ fontSize: 14, width: 24, textAlign: "center" }}>✕</span>
            <span>None — remove</span>
            {!garment && <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12, marginLeft: "auto" }}>{"\u2713"}</span>}
          </div>
          {candidates.map(c => {
            const cPhoto = c.thumbnail || c.photoUrl;
            return (
              <div key={c.id}
                onClick={() => { onSwap(slot, c); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                  background: c.id === garment?.id ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                  borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
                }}
              >
                {cPhoto ? (
                  <img
                    src={cPhoto}
                    alt={c.name ?? ""}
                    onClick={e => { e.stopPropagation(); setLightbox({ src: cPhoto, alt: `${c.color ?? ""} ${c.type ?? ""}`.trim() }); }}
                    style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover", cursor: "zoom-in" }}
                  />
                ) : (
                  <span style={{ fontSize: 14, width: 24, textAlign: "center" }}>{icon}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.color} {c.type}
                  </div>
                  {c.brand && <div style={{ fontSize: 10, color: sub }}>{c.brand}</div>}
                </div>
                {c.id === garment?.id && <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 12 }}>{"\u2713"}</span>}
              </div>
            );
          })}
        </div>
      )}
      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Weather Badge ───────────────────────────────────────────────────────────
function WeatherBadge({ forecast, isDark }) {
  if (!forecast) return null;
  const icon = WEATHER_ICONS[forecast.description] ?? "\u{1F321}\uFE0F";
  const layer = getLayerRecommendation(forecast.tempC);
  const transition = getLayerTransition(forecast);
  const hasHourly = forecast.tempMorning != null;
  return (
    <div style={{
      fontSize: 11, color: isDark ? "#8b93a7" : "#6b7280",
      padding: "4px 8px", borderRadius: 6,
      background: isDark ? "#171a2188" : "#f3f4f688",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{icon}</span>
        <span>{forecast.tempMin}{"\u00B0"}{"\u2013"}{forecast.tempMax}{"\u00B0"}C</span>
        {layer.layer !== "none" && (
          <span style={{ color: "#f97316", fontWeight: 600 }}>{"\u00B7"} {layer.label.replace(" recommended", "")}</span>
        )}
      </div>
      {hasHourly && (
        <div style={{ fontSize: 10, marginTop: 3, color: isDark ? "#6b7280" : "#9ca3af" }}>
          {forecast.tempMorning != null && <span>🌅 {forecast.tempMorning}°</span>}
          {forecast.tempMidday != null && <span> · ☀️ {forecast.tempMidday}°</span>}
          {forecast.tempEvening != null && <span> · 🌙 {forecast.tempEvening}°</span>}
          {transition && layer.layer !== "none" && forecast.tempMidday > forecast.tempMorning + 4 && (
            <div style={{ color: "#f97316", marginTop: 2 }}>
              💡 Shed the layer after noon ({forecast.tempMidday}°C)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OnCall Calendar ───────────────────────────────────────────────────────────
function OnCallCalendar({ onCallDates, onToggle, isDark }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  const today = new Date();
  const todayIso = isoOf(today);

  function buildGrid(year, month) {
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const days  = [];
    for (let i = (first.getDay() + 6) % 7; i > 0; i--) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }

  const { year, month } = viewDate;
  const grid = buildGrid(year, month);
  const monthLabel = new Date(year, month, 1).toLocaleString("default", { month:"long", year:"numeric" });

  const bg = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{ padding:"14px 16px", borderRadius:14, background:bg, border:`1px solid ${border}`, marginTop:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14, color:text }}>On-Call Dates</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setViewDate(({ year:y, month:m }) => m===0 ? {year:y-1,month:11} : {year:y,month:m-1})}
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>{"\u2039"}</button>
          <span style={{ fontSize:12, fontWeight:600, color:text, minWidth:120, textAlign:"center" }}>{monthLabel}</span>
          <button onClick={() => setViewDate(({ year:y, month:m }) => m===11 ? {year:y+1,month:0} : {year:y,month:m+1})}
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>{"\u203A"}</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:4 }}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:"#6b7280", padding:"2px 0" }}>{d}</div>
        ))}
        {grid.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoOf(d);
          const isOC = onCallDates.includes(iso);
          const isToday = iso === todayIso;
          const isPast = d < today && !isToday;
          return (
            <button
              key={i} onClick={() => !isPast && onToggle(iso)}
              disabled={isPast}
              style={{
                borderRadius:6, border:"none", fontSize:11, fontWeight:isToday?700:400,
                padding:"4px 2px", cursor:isPast?"default":"pointer",
                background: isOC ? "#f97316" : isToday ? (isDark?"#2b3140":"#dbeafe") : "transparent",
                color: isOC ? "#fff" : isPast ? "#4b5563" : text,
                opacity: isPast ? 0.4 : 1,
              }}
            >{d.getDate()}</button>
          );
        })}
      </div>

      {onCallDates.length > 0 && (
        <div style={{ fontSize:11, color:"#f97316", marginTop:6 }}>
          {"\u{1F7E0}"} {onCallDates.filter(d => d >= todayIso).sort().slice(0,4).join("  ")}
          {onCallDates.filter(d => d >= todayIso).length > 4 ? " \u2026" : ""}
        </div>
      )}
    </div>
  );
}

// ── Main WeekPlanner ──────────────────────────────────────────────────────────
export default function WeekPlanner() {
  const watches    = useWatchStore(s => s.watches) ?? [];
  const history    = useHistoryStore(s => s.entries) ?? [];
  const addEntry   = useHistoryStore(s => s.addEntry);
  const upsertEntry = useHistoryStore(s => s.upsertEntry);
  const weekCtx    = useWardrobeStore(s => s.weekCtx) ?? [];
  const onCallDates= useWardrobeStore(s => s.onCallDates) ?? [];
  const setWeekCtx = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates = useWardrobeStore(s => s.setOnCallDates);
  const garments     = useWardrobeStore(s => s.garments) ?? [];
  const straps       = useStrapStore(s => s.straps) ?? {};
  const activeStrap  = useStrapStore(s => s.activeStrap) ?? {};
  const { mode }     = useThemeStore();
  const isDark     = mode === "dark";
  const [showCalendar, setShowCalendar] = useState(false);
  const [showOutfits, setShowOutfits]   = useState(true);
  const [watchOverrides, setWatchOverrides] = useState({});
  const [strapOverrides, setStrapOverrides] = useState({});
  // Shuffle seeds: per-day counter that forces re-scoring with randomized tie-breaking
  const [shuffleSeeds, setShuffleSeeds]   = useState({});
  // pendingLog: holds the day offset + pre-built garmentIds while modal is open
  const [pendingLog, setPendingLog] = useState(null);
  // pendingAddOutfit: day data for the "add another outfit" modal
  const [pendingAddOutfit, setPendingAddOutfit] = useState(null);
  const [pickingDay, setPickingDay]         = useState(null);
  const [aiLoadingDay, setAiLoadingDay]     = useState(null); // date string of day being AI-picked
  // Days where Claude AI was explicitly applied — surfaces an "AI" badge on those
  // outfits only. Cleared when the user resets the day's outfit overrides.
  const [aiAppliedDays, setAiAppliedDays]   = useState(new Set());
  // Per-day rolling list of recent AI picks (for excludeRecent on regenerate/steer).
  // { [date]: [{ watch, watchId, shirt, sweater, pants, shoes, jacket }, ...] }
  const [recentAiPicks, setRecentAiPicks]   = useState({});
  // Per-day "Why this?" rationale text shown in a popover.
  // { [date]: { text, loading } }
  const [aiRationale, setAiRationale]       = useState({});
  // Per-day dual-dial side override: { [YYYY-MM-DD]: "A" | "B" | null }
  const [dialSideOverrides, setDialSideOverrides] = useState({});
  // Per-day per-slot garment overrides: { [YYYY-MM-DD]: { shirt: garmentId, ... } }
  // Keyed by ISO date (not offset) so overrides survive midnight correctly.
  // Offset-keyed overrides would shift: what was tomorrow (offset:1) becomes today
  // (offset:0) after midnight, attaching a wrong garment override to the wrong day.
  const [outfitOverrides, setOutfitOverrides] = useState(() => {
    try {
      const cached = useWardrobeStore.getState();
      const raw = cached._outfitOverrides ?? {};
      // Migrate legacy offset-keyed overrides → drop them (offsets are ambiguous after reboot)
      const isDateKeyed = Object.keys(raw).every(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
      if (!isDateKeyed) return {}; // discard legacy format
      // Prune dates older than 7 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return Object.fromEntries(Object.entries(raw).filter(([d]) => d >= cutoffStr));
    } catch { return {}; }
  });

  // Persist outfit overrides to IDB when they change
  useEffect(() => {
    setCachedState({ _outfitOverrides: outfitOverrides }).catch(() => {});
  }, [outfitOverrides]);

  // 7-day weather forecast with IDB caching (1-hour TTL)
  const [forecast, setForecast] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { getCachedState: getCache } = await import("../services/localCache.js");
        const cached = await getCache();
        const now = Date.now();
        if (cached._forecast && cached._forecastTs && (now - cached._forecastTs) < 3600000) {
          setForecast(cached._forecast);
          return;
        }
      } catch {}
      try {
        const data = await fetchWeatherForecast();
        setForecast(data);
        setCachedState({ _forecast: data, _forecastTs: Date.now() }).catch(() => {});
      } catch (err) {
        console.warn("[weather] forecast failed:", err.message);
      }
    })();
  }, []);

  const rawRotation = useMemo(
    () => genWeekRotation(watches, history, weekCtx, onCallDates),
    [watches, history, weekCtx, onCallDates]
  );

  const rotation = useMemo(() =>
    rawRotation.map(day => {
      const oid = watchOverrides[day.date];
      if (!oid) return day;
      const w = watches.find(x => x.id === oid);
      return w ? { ...day, watch: w, isOverridden: true } : day;
    }),
    [rawRotation, watchOverrides, watches]
  );

  // Wearable garments (exclude accessories)
  const wearable = useMemo(() =>
    garments.filter(g => !ACCESSORY_TYPES.has(g.type) && !g.excludeFromWardrobe),
    [garments]
  );

  // Candidates per slot type for swap dropdowns.
  // normalizeType ensures polo→shirt, jeans→pants, sneakers→shoes,
  // blazer→jacket, cardigan→sweater etc. are included in the right slot.
  const slotCandidates = useMemo(() => {
    const result = {};
    for (const slot of OUTFIT_SLOTS) {
      result[slot] = wearable.filter(g => {
        const rawType = g.type ?? "";
        return normalizeType(rawType) === slot;
      });
    }
    return result;
  }, [wearable]);

  // Generate outfits per day — uses watch + strap, weather forecast, and diversity penalty
  // Cross-day diversity: track per-slot garment usage across the week to avoid
  // wearing the same shirt/pants/shoes on consecutive days. Each day's fake history
  // injects previously-picked garments with correct slot placement so the diversity
  // penalty (-0.12 per appearance) triggers naturally in the scoring engine.
  const weekOutfits = useMemo(() => {
    const usedPerSlot = {}; // { shirt: [g1, g2], pants: [...], ... }
    for (const slot of OUTFIT_SLOTS) usedPerSlot[slot] = [];

    return rotation.map(day => {
      if (!day.watch) return {};
      const dayForecast = forecast.find(f => f.date === day.date);
      // Missing forecast → 22°C (neutral-warm threshold — no extra layer added) so
      // weather-fetch failures don't auto-stack sweater + jacket. Pre-2026-04-28: 15°C.
      const weather = dayForecast ? { tempC: dayForecast.tempC } : { tempC: 22 };

      // For today: if already logged, use logged garments directly.
      // But still allow manual overrides (user can swap slots on a logged outfit).
      if (day.offset === 0) {
        const loggedEntry = history.find(h => h.date === day.date);
        const loggedIds = loggedEntry?.garmentIds ?? loggedEntry?.payload?.garmentIds ?? [];
        if (loggedIds.length > 0) {
          const loggedOutfit = { _isLogged: true };
          const dayOverrides = outfitOverrides[day.date] ?? {};
          for (const slot of OUTFIT_SLOTS) {
            // Check if user manually overrode this slot
            if (slot in dayOverrides) {
              const overrideId = dayOverrides[slot];
              loggedOutfit[slot] = overrideId ? garments.find(g => g.id === overrideId) ?? null : null;
            } else {
              const candidates = garments.filter(g => loggedIds.includes(g.id));
              const match = candidates.find(g => normalizeType(g.type ?? "") === slot);
              if (match) loggedOutfit[slot] = match;
            }
            if (loggedOutfit[slot]?.id) usedPerSlot[slot].push(loggedOutfit[slot].id);
          }
          return loggedOutfit;
        }
      }

      // Enrich watch with active strap for this day (shoe-strap coordination)
      const dayWatchId = watchOverrides[day.date] ?? day.watch?.id;
      // strapOverrides may hold a strap from a PREVIOUS watch if the watch was
      // overridden after the strap was tapped. Scope to current watch only.
      const rawStrapOverride = strapOverrides[day.date];
      const scopedStrapOverride = (rawStrapOverride && straps[rawStrapOverride]?.watchId === dayWatchId)
        ? rawStrapOverride : null;
      const dayStrapId = scopedStrapOverride
        ?? (dayWatchId && activeStrap[dayWatchId]) ?? null;
      const dayStrapObj = dayStrapId ? straps[dayStrapId] : null;
      let enrichedWatch = day.watch;
      // Apply dual-dial side override (Reverso: "A" = navy, "B" = white)
      const dialSide = dialSideOverrides[day.date];
      if (enrichedWatch?.dualDial && dialSide) {
        const dialColor = dialSide === "B" ? enrichedWatch.dualDial.sideB : enrichedWatch.dualDial.sideA;
        enrichedWatch = { ...enrichedWatch, dial: dialColor };
      }
      if (dayStrapObj) {
        const strapStr = dayStrapObj.type === "bracelet" || dayStrapObj.type === "integrated"
          ? dayStrapObj.type
          : `${dayStrapObj.color} ${dayStrapObj.type}`;
        enrichedWatch = { ...day.watch, strap: strapStr };
      }

      // Build proper per-slot fake history so diversity penalty fires per-slot
      // Each fake entry places the used garment ID in the correct slot only
      const fakeHistory = [...history];
      for (const slot of OUTFIT_SLOTS) {
        for (const gId of usedPerSlot[slot]) {
          fakeHistory.push({ outfit: { [slot]: gId } });
        }
      }

      // Shuffle: each shuffle press adds heavy fake-history entries for previous picks,
      // forcing the scoring engine to penalize them and surface alternatives.
      // shuffleSeed N means "skip the top N combinations" — each increment adds
      // 5 fake appearances per slot, enough to push -0.60 penalty and force next-best.
      // Extract pinned garments for this day so engine complements them
      const dayOverrides = outfitOverrides[day.date] ?? {};
      const pinnedSlotGarments = {};
      for (const slot of OUTFIT_SLOTS) {
        if (dayOverrides[slot]) {
          const g = garments.find(x => x.id === dayOverrides[slot]);
          if (g) pinnedSlotGarments[slot] = g;
        }
      }

      const shuffleSeed = shuffleSeeds[day.date] ?? 0;
      let iterHistory = [...fakeHistory];
      let outfit = {};
      // Track all previously shuffled garments per slot — prevents cycling back
      // to an earlier pick once it falls outside diversityBonus's slice(-5) window.
      const shuffleExcluded = {};
      for (const slot of OUTFIT_SLOTS) shuffleExcluded[slot] = new Set();

      for (let round = 0; round <= shuffleSeed; round++) {
        try {
          outfit = buildOutfit(enrichedWatch, wearable, weather, iterHistory, [], pinnedSlotGarments, shuffleExcluded, day.ctx);
        } catch (_e) {
          // Graceful fallback — empty outfit rather than crash
          outfit = { shirt: null, pants: null, shoes: null, jacket: null, sweater: null, layer: null, belt: null,
            _score: 0, _confidence: 0, _confidenceLabel: "none", _explanation: ["Outfit generation failed — try shuffling."] };
          break;
        }
        if (round < shuffleSeed) {
          // Poison this round's picks so next iteration picks runner-up.
          // IMPORTANT: must be ONE combined entry per push (not per-slot batches).
          // diversityBonus checks slice(-5), so per-slot batches bury early slots
          // outside the window — only jacket (last slot) would get penalized.
          // Combined entries ensure all slots appear in every history entry.
          const combined = { outfit: {} };
          const allIds = [];
          for (const slot of OUTFIT_SLOTS) {
            if (outfit[slot]?.id) {
              combined.outfit[slot] = outfit[slot].id;
              allIds.push(outfit[slot].id);
              // Also permanently exclude this pick from future shuffle rounds
              shuffleExcluded[slot].add(outfit[slot].id);
            }
          }
          // garmentIds needed so repetitionPenalty (contextMemory.js) also fires
          combined.garmentIds = allIds;
          for (let i = 0; i < 5; i++) iterHistory.push(combined);
        }
      }

      // Apply manual overrides
      const overrides = outfitOverrides[day.date] ?? {};
      for (const slot of OUTFIT_SLOTS) {
        if (overrides[slot]) {
          const g = garments.find(x => x.id === overrides[slot]);
          if (g) outfit[slot] = g;
        }
      }

      // Track used garments per-slot for cross-day diversity
      for (const slot of OUTFIT_SLOTS) {
        if (outfit[slot]?.id) usedPerSlot[slot].push(outfit[slot].id);
      }

      return outfit;
    });
  }, [rotation, wearable, garments, history, forecast, outfitOverrides, watchOverrides, strapOverrides, straps, activeStrap, shuffleSeeds, dialSideOverrides]);

  const today = new Date().toISOString().slice(0, 10);

  function handleCtxChange(offset, ctx) {
    const dayIdx = (new Date().getDay() + offset) % 7;
    const next   = [...weekCtx];
    next[dayIdx] = ctx;
    setWeekCtx(next);
    setCachedState({ weekCtx: next }).catch(() => {});
  }

  function handleToggleOnCall(iso) {
    const next = onCallDates.includes(iso)
      ? onCallDates.filter(d => d !== iso)
      : [...onCallDates, iso].sort();
    setOnCallDates(next);
    setCachedState({ onCallDates: next }).catch(() => {});
  }

  const handleSwapGarment = useCallback((date, slot, garment) => {
    setOutfitOverrides(prev => ({
      ...prev,
      [date]: { ...(prev[date] ?? {}), [slot]: garment?.id ?? null },
    }));
    // Reset shuffle seed so non-pinned slots find their best complement for the new pick
    setShuffleSeeds(prev => { const n = { ...prev }; delete n[date]; return n; });
  }, []);

  const handleShuffle = useCallback((date) => {
    setShuffleSeeds(prev => ({ ...prev, [date]: ((prev[date] ?? 0) + 1) % 12 }));
  }, []);

  const handleResetOutfit = useCallback((date) => {
    setShuffleSeeds(prev => { const n = { ...prev }; delete n[date]; return n; });
    setOutfitOverrides(prev => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    setAiAppliedDays(prev => { if (!prev.has(date)) return prev; const n = new Set(prev); n.delete(date); return n; });
    setRecentAiPicks(prev => { if (!prev[date]) return prev; const n = { ...prev }; delete n[date]; return n; });
    setAiRationale(prev => { if (!prev[date]) return prev; const n = { ...prev }; delete n[date]; return n; });
  }, []);

  // Compact pick projection used as excludeRecent payload (avoid echoing weather/etc.)
  const compactPickForExclude = useCallback((pick) => ({
    watch: pick.watch ?? null,
    watchId: pick.watchId ?? null,
    shirt: pick.shirt ?? null,
    sweater: pick.sweater ?? null,
    pants: pick.pants ?? null,
    shoes: pick.shoes ?? null,
    jacket: pick.jacket ?? null,
  }), []);

  /**
   * Ask Claude for an AI outfit recommendation.
   * Flexibility verbs:
   *   - steer:    "more_casual" | "more_formal" | "different_watch"
   *   - regen:    pass useExclude:true to send recentAiPicks[date] so the model
   *               picks something genuinely different from prior tries.
   *   - rejected: { outfit, reason } — fire-and-forget feedback. The endpoint
   *               logs it and avoids the same direction in the regenerate.
   */
  const handleAskClaude = useCallback(async (date, dayForecast, opts = {}) => {
    const { steer = null, useExclude = false, rejected = null } = opts;
    setAiLoadingDay(date);
    try {
      const weather = dayForecast ? {
        tempC: dayForecast.tempC,
        tempMorning: dayForecast.tempMorning,
        tempMidday: dayForecast.tempMidday,
        tempEvening: dayForecast.tempEvening,
        description: dayForecast.description,
      } : undefined;
      const recent = recentAiPicks[date] ?? [];
      const body = {
        forceRefresh: true,
        weather,
        ...(steer ? { steer } : {}),
        ...(useExclude && recent.length ? { excludeRecent: recent } : {}),
        ...(rejected ? { rejected } : {}),
      };
      const res = await fetch("/.netlify/functions/daily-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const pick = await res.json();
      if (pick.error) throw new Error(pick.error);

      // Map AI garment names to IDs
      const overrides = {};
      for (const slot of OUTFIT_SLOTS) {
        const name = pick[slot];
        if (!name || name === "null") { overrides[slot] = null; continue; }
        const match = garments.find(g =>
          g.name === name || g.name?.toLowerCase() === name?.toLowerCase()
        );
        if (match) overrides[slot] = match.id;
      }

      // Do NOT apply watch override from AI — user already selected their watch.
      setOutfitOverrides(prev => ({ ...prev, [date]: overrides }));
      setShuffleSeeds(prev => { const n = { ...prev }; delete n[date]; return n; });
      setAiAppliedDays(prev => { const n = new Set(prev); n.add(date); return n; });
      // Track rolling list of last 5 picks for this day so excludeRecent works.
      setRecentAiPicks(prev => {
        const compact = compactPickForExclude(pick);
        const list = [compact, ...(prev[date] ?? [])].slice(0, 5);
        return { ...prev, [date]: list };
      });
      // Surface reasoning if the model returned it (no extra round-trip).
      if (pick.reasoning) {
        setAiRationale(prev => ({ ...prev, [date]: { text: pick.reasoning, loading: false } }));
      }
    } catch (e) {
      console.warn("[WeekPlanner] AI pick failed:", e.message);
    } finally {
      setAiLoadingDay(null);
    }
  }, [garments, watches, recentAiPicks, compactPickForExclude]);

  // "Why this?" — surface stored reasoning, or call the endpoint with why:true
  // for a fresh rationale on the current day's outfit.
  const handleWhyAI = useCallback(async (date) => {
    const existing = aiRationale[date]?.text;
    if (existing) {
      // Toggle off when already shown
      setAiRationale(prev => { const n = { ...prev }; delete n[date]; return n; });
      return;
    }
    const recent = recentAiPicks[date] ?? [];
    const last = recent[0];
    if (!last) return;
    setAiRationale(prev => ({ ...prev, [date]: { text: null, loading: true } }));
    try {
      const res = await fetch("/.netlify/functions/daily-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ why: true, currentPick: last }),
      });
      const data = await res.json();
      setAiRationale(prev => ({ ...prev, [date]: { text: data.rationale ?? "No rationale available.", loading: false } }));
    } catch {
      setAiRationale(prev => ({ ...prev, [date]: { text: "Could not fetch rationale.", loading: false } }));
    }
  }, [aiRationale, recentAiPicks]);

  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#6b7280" : "#9ca3af";
  const muted  = sub; // alias — used by history entry notes display

  return (
    <div style={{ padding:"18px 20px", borderRadius:16, background:bg, border:`1px solid ${border}`, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:text }}>7-Day Rotation</h2>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <button onClick={() => setShowOutfits(v => !v)} style={{
            background:showOutfits?"#3b82f622":"transparent", border:`1px solid ${showOutfits?"#3b82f6":border}`,
            color:showOutfits?"#3b82f6":sub, borderRadius:8, padding:"5px 12px",
            fontSize:12, fontWeight:600, cursor:"pointer",
          }}>
            {"\u{1F454}"} Outfits {showOutfits ? "ON" : "OFF"}
          </button>
          <button onClick={() => setShowCalendar(v => !v)} style={{
            background:showCalendar?"#f9731622":"transparent", border:`1px solid ${showCalendar?"#f97316":border}`,
            color:showCalendar?"#f97316":sub, borderRadius:8, padding:"5px 12px",
            fontSize:12, fontWeight:600, cursor:"pointer",
          }}>
            {"\u{1F7E0}"} On-Call {onCallDates.length > 0 ? `(${onCallDates.filter(d=>d>=today).length})` : ""}
          </button>
        </div>
      </div>

      <WeekPlanLock
        weekPlan={weekOutfits.map((o, i) => ({
          date: rotation[i]?.date,
          watchId: rotation[i]?.watch?.id,
          outfit: o ? { shirt: o.shirt?.name, pants: o.pants?.name, shoes: o.shoes?.name, sweater: o.sweater?.name, jacket: o.jacket?.name } : null,
        }))}
        watches={watches}
        isDark={isDark}
      />

      <RotationInsights rotation={rotation} history={history} isDark={isDark} />

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {rotation.map((day, dayIdx) => {
          const isToday = day.date === today;
          const cardBg = day.isOnCall
            ? (isDark ? "#1a1400" : "#fff8f0")
            : isToday ? (isDark ? "#0d1929" : "#eff6ff")
            : (isDark ? "#0f131a" : "#f9fafb");
          const cardBorder = day.isOnCall ? "#f97316" : isToday ? "#3b82f6" : border;
          const dayForecast = forecast.find(f => f.date === day.date);
          const dayOutfit = weekOutfits[dayIdx] ?? {};
          const hasOverrides = !!outfitOverrides[day.date];

          // Repeat warning: check if this outfit's watch was worn in last 3 history entries
          const dayWatchId = (watchOverrides[day.date] ?? rotation[dayIdx]?.watch?.id);
          const cutoffDate = new Date(day.date);
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          const cutoffStr = cutoffDate.toISOString().slice(0, 10);
          const recentEntries = history.filter(e => e.date && e.date >= cutoffStr && e.date < day.date);
          const recentWatchDates = recentEntries.filter(e => e.watchId === dayWatchId).map(e => e.date);
          const watchRepeated = recentWatchDates.length > 0;
          const lastWornDays = recentWatchDates.length > 0
            ? Math.round((new Date(day.date) - new Date(recentWatchDates[recentWatchDates.length - 1])) / 864e5)
            : null;

          // Outfit similarity check: are 3+ garments identical to any recent history entry?
          const dayGarmentIds = new Set(OUTFIT_SLOTS.map(s => dayOutfit[s]?.id).filter(Boolean));
          const outfitRepeated = recentEntries.some(e => {
            const prev = new Set(e.garmentIds ?? []);
            const overlap = [...dayGarmentIds].filter(id => prev.has(id)).length;
            return overlap >= 3;
          });

          return (
            <div key={day.offset} style={{
              borderRadius:12, padding:"12px 14px",
              background:cardBg, border:`1px solid ${cardBorder}`,
            }}>
              {/* Day header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontWeight:700, fontSize:13, color:text }}>
                    {isToday ? "Today" : day.dayName}
                  </span>
                  <span style={{ fontSize:11, color:sub }}>{day.date.slice(5)}</span>
                  {day.isOnCall && (
                    <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                                   background:"#f97316", color:"#fff" }}>ON-CALL</span>
                  )}
                  {outfitRepeated && (
                    <span title="Similar outfit worn recently" style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                                   background:"#7c3aed", color:"#fff" }}>↺ Repeat</span>
                  )}
                  {!outfitRepeated && watchRepeated && lastWornDays !== null && lastWornDays <= 4 && (
                    <span title={`Watch worn ${lastWornDays}d ago`} style={{ fontSize:10, padding:"1px 6px", borderRadius:4,
                                   background:isDark?"#1e293b":"#f1f5f9", color:"#94a3b8", border:"1px solid #334155" }}>
                      ⌚ {lastWornDays}d ago
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <WeatherBadge forecast={dayForecast} isDark={isDark} />
                  <select
                    value={day.ctx}
                    onChange={e => handleCtxChange(day.offset, e.target.value)}
                    style={{
                      fontSize:11, padding:"2px 6px", borderRadius:6,
                      border:`1px solid ${border}`, background:isDark?"#171a21":"#f3f4f6",
                      color:text, cursor:"pointer",
                    }}
                  >
                    {CONTEXTS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Watch */}
              <WatchMini watch={day.watch} isDark={isDark} isOnCall={day.isOnCall}
                label={day.isLoggedToday ? "wearing now" : day.isOverridden ? "overridden" : null}
                daysSince={day.watch ? daysSinceWorn(day.watch.id, history) : null} />

              {/* Watch override picker */}
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setPickingDay(pickingDay === day.offset ? null : day.offset)}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                            border: `1px solid ${day.isOverridden ? "#3b82f6" : border}`,
                            background: day.isOverridden ? "#3b82f622" : "transparent",
                            color: day.isOverridden ? "#3b82f6" : sub, fontWeight: 600 }}>
                  {day.isOverridden ? "\u231A Change" : "\u231A Override"}
                </button>
                {day.isOverridden && (
                  <button onClick={() => setWatchOverrides(o => { const n = {...o}; delete n[day.date]; return n; })}
                    title="Revert watch override — use rotation pick"
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${border}`, background: "transparent", color: "#ef4444", fontWeight: 600 }}>
                    Reset watch
                  </button>
                )}
              </div>

              {/* Watch picker dropdown */}
              {pickingDay === day.offset && (
                <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 10,
                              background: isDark ? "#171a21" : "#fff", overflow: "hidden" }}>
                  {watches.filter(w => !w.retired && !w.pending).map(w => {
                    const isSelected = (watchOverrides[day.date] ?? day.watch?.id) === w.id;
                    return (
                      <div key={w.id}>
                        <div onClick={() => {
                          setWatchOverrides(o => ({ ...o, [day.date]: w.id }));
                          setPickingDay(null);
                        }}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer",
                                    background: isSelected ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                                    borderBottom: `1px solid ${border}` }}>
                          <span style={{ fontSize: 16 }}>{w.emoji ?? "\u231A"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                            <div style={{ fontSize: 10, color: sub }}>{w.dualDial ? `${w.dualDial.sideA}/${w.dualDial.sideB}` : w.dial} {"\u00B7"} {w.replica ? "replica" : "genuine"}</div>
                          </div>
                          {isSelected && <span style={{ color: "#3b82f6", fontWeight: 700 }}>{"\u2713"}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strap picker */}
              {(() => {
                const dayWatchId = watchOverrides[day.date] ?? day.watch?.id;
                if (!dayWatchId) return null;
                const dayStraps = Object.values(straps).filter(s => s.watchId === dayWatchId);
                if (dayStraps.length <= 1) return null;
                const activeStrapId = (() => {
                  // strapOverrides may hold a strap from a PREVIOUS watch if the watch
                  // was overridden after the strap was tapped. Scope it to the current watch.
                  const overrideId = strapOverrides[day.date];
                  if (overrideId && straps[overrideId]?.watchId === dayWatchId) return overrideId;
                  return Object.values(straps).find(s => s.watchId === dayWatchId && activeStrap[dayWatchId] === s.id)?.id
                    ?? dayStraps[0]?.id;
                })();
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: sub, fontWeight: 600, marginBottom: 5 }}>STRAP</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {dayStraps.map(s => {
                        const isActive = activeStrapId === s.id;
                        return (
                          <button key={s.id}
                            onClick={() => setStrapOverrides(o => ({ ...o, [day.date]: s.id }))}
                            style={{ padding: "4px 9px", borderRadius: 7, fontSize: 10, fontWeight: 600,
                                      border: `1px solid ${isActive ? "#3b82f6" : border}`,
                                      background: isActive ? "#3b82f622" : "transparent",
                                      color: isActive ? "#3b82f6" : sub, cursor: "pointer" }}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {activeStrapId && straps[activeStrapId] && (
                      <div style={{ fontSize: 10, color: sub, marginTop: 4 }}>
                        {straps[activeStrapId].useCase}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dual-dial toggle (Reverso) */}
              {(() => {
                const dayWatch = watches.find(w => w.id === (watchOverrides[day.date] ?? day.watch?.id));
                if (!dayWatch?.dualDial) return null;
                const activeSide = dialSideOverrides[day.date] ?? null;
                const displayLabel = activeSide === "B" ? dayWatch.dualDial.sideB_label
                  : activeSide === "A" ? dayWatch.dualDial.sideA_label
                  : dayWatch.dualDial.sideA_label + " (auto)";
                return (
                  <div style={{
                    display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
                    borderRadius:8, marginTop:8,
                    border:`1px solid ${isDark?"#312e81":"#c7d2fe"}`,
                    background:isDark?"#1e1b4b":"#eef2ff", fontSize:11,
                  }}>
                    <span style={{fontSize:13}}>🔄</span>
                    <span style={{color:isDark?"#a5b4fc":"#4338ca", fontWeight:600}}>
                      {displayLabel}
                    </span>
                    <div style={{marginLeft:"auto", display:"flex", gap:4}}>
                      {["A","B"].map(side => (
                        <button key={side}
                          onClick={() => setDialSideOverrides(prev => ({ ...prev, [day.date]: prev[day.date] === side ? null : side }))}
                          style={{
                            fontSize:10, padding:"2px 7px", borderRadius:5, cursor:"pointer", fontWeight:600,
                            border:`1px solid ${activeSide === side ? "#6366f1" : (isDark?"#3730a3":"#c7d2fe")}`,
                            background:activeSide === side ? "#6366f122" : "transparent",
                            color:isDark?"#a5b4fc":"#4338ca",
                          }}>
                          {side === "A" ? dayWatch.dualDial.sideA_label : dayWatch.dualDial.sideB_label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Clothing rotation — outfit per day */}
              {showOutfits && day.watch && wearable.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 10, color: sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        OUTFIT
                      </div>
                      {dayOutfit._isLogged && (
                        <div style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                      background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>
                          ✓ Logged
                        </div>
                      )}
                      {aiAppliedDays.has(day.date) && !dayOutfit._isLogged && (
                        <div title="Claude AI override applied — tap Reset outfit to revert"
                             style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                      background: "#8b5cf622", color: "#8b5cf6", border: "1px solid #8b5cf644" }}>
                          ✦ AI
                        </div>
                      )}
                    </div>
                    {!dayOutfit._isLogged && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => handleShuffle(day.date)}
                        title="Shuffle for alternative outfit"
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                                  border: `1px solid ${isDark ? "#4f46e5" : "#6366f1"}`,
                                  background: shuffleSeeds[day.date] ? "#6366f122" : "transparent",
                                  color: isDark ? "#818cf8" : "#6366f1", fontWeight: 600 }}>
                        {"\u{1F500}"} Shuffle{shuffleSeeds[day.date] ? ` (${shuffleSeeds[day.date]})` : ""}
                      </button>
                      <button onClick={() => handleAskClaude(day.date, dayForecast)}
                        disabled={aiLoadingDay === day.date}
                        title="Ask Claude — single AI outfit override"
                        style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                                  border: "1px solid #8b5cf6",
                                  background: aiLoadingDay === day.date ? "#8b5cf622" : "transparent",
                                  color: "#8b5cf6", fontWeight: 700, opacity: aiLoadingDay === day.date ? 0.6 : 1,
                                  display: "flex", alignItems: "center", gap: 3 }}>
                        {aiLoadingDay === day.date ? "..." : <>{"✨"} Ask Claude</>}
                      </button>
                      {(hasOverrides || shuffleSeeds[day.date]) && (
                        <button onClick={() => handleResetOutfit(day.date)}
                          title="Reset outfit to engine pick"
                          style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                                    border: `1px solid ${border}`, background: "transparent", color: "#ef4444", fontWeight: 600 }}>
                          Reset outfit
                        </button>
                      )}
                    </div>
                    )}
                  </div>
                  {/* AI flexibility row — only shown after Claude has applied a pick */}
                  {aiAppliedDays.has(day.date) && !dayOutfit._isLogged && (
                    <AiFlexRow
                      date={day.date}
                      dayForecast={dayForecast}
                      border={border}
                      isDark={isDark}
                      loading={aiLoadingDay === day.date}
                      rationale={aiRationale[day.date]}
                      lastPick={(recentAiPicks[day.date] ?? [])[0] ?? null}
                      onAsk={handleAskClaude}
                      onWhy={() => handleWhyAI(day.date)}
                    />
                  )}
                  <style>{`
                    .wa-week-outfit-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
                    @media (max-width:500px) { .wa-week-outfit-grid { grid-template-columns:1fr; } }
                  `}</style>
                  <div className="wa-week-outfit-grid">
                    {OUTFIT_SLOTS.map(slot => (
                      <OutfitSlotChip
                        key={slot}
                        slot={slot}
                        garment={dayOutfit[slot]}
                        isDark={isDark}
                        border={border}
                        candidates={slotCandidates[slot] ?? []}
                        onSwap={(s, g) => handleSwapGarment(day.date, s, g)}
                      />
                    ))}
                  </div>

                  {/* Strap recommendation */}
                  {dayOutfit._strapRecommendation && !dayOutfit._isLogged && (
                    <div style={{ marginTop: 6, fontSize: 10, color: "#f59e0b", padding: "3px 8px",
                                  borderRadius: 5, background: isDark ? "#78350f22" : "#fef3c722" }}>
                      ⌚ Suggested strap: <strong>{dayOutfit._strapRecommendation.label}</strong>
                    </div>
                  )}

                  {/* Explanation — collapsible */}
                  {dayOutfit._explanation?.length > 0 && !dayOutfit._isLogged && (
                    <details style={{ marginTop: 6, fontSize: 10, color: muted }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, color: isDark ? "#8b93a7" : "#6b7280" }}>
                        Why this outfit?
                      </summary>
                      <div style={{ marginTop: 4, paddingLeft: 8, lineHeight: 1.6 }}>
                        {dayOutfit._explanation.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Wear This Outfit (today, not yet logged) / Log This Outfit (future days) */}
              {showOutfits && day.watch && !dayOutfit._isLogged && (() => {
                const dayEntries = history.filter(h => h.date === day.date);
                return dayEntries.length === 0 ? (
                  <button
                    onClick={() => {
                      const garmentIds = OUTFIT_SLOTS
                        .map(s => dayOutfit[s]?.id)
                        .filter(Boolean);
                      setPendingLog({ day, garmentIds });
                    }}
                    style={{
                      width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 8,
                      background: isToday ? "#22c55e" : isDark ? "#1e293b" : "#f1f5f9",
                      color: isToday ? "#fff" : isDark ? "#94a3b8" : "#64748b",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: isToday ? "none" : `1px solid ${border}`,
                    }}
                  >
                    {isToday ? "Wear This Outfit" : "Log This Outfit"}
                  </button>
                ) : null;
              })()}

              {/* Multi-outfit: show all logged entries for the day + Add Another button */}
              {showOutfits && (() => {
                const dayEntries = history.filter(h => h.date === day.date);
                if (dayEntries.length === 0) return null;
                return (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: sub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Logged Outfits ({dayEntries.length})
                    </div>
                    {dayEntries.map((entry, i) => {
                      const slotLabel = entry.timeSlot
                        ? { morning: "🌅 Morning", afternoon: "☀️ Afternoon", evening: "🌆 Evening", night: "🌙 Night" }[entry.timeSlot] ?? entry.timeSlot
                        : i === 0 ? "Primary" : `Outfit ${i + 1}`;
                      const entryWatch = watches.find(w => w.id === (entry.watchId ?? entry.watch_id));
                      return (
                        <div key={entry.id} style={{
                          marginBottom: 8, padding: "8px 10px", borderRadius: 8,
                          background: isDark ? "#0f131a" : "#f8fafc",
                          border: `1px solid ${border}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>{slotLabel}</span>
                            {entryWatch && (
                              <span style={{ fontSize: 10, color: sub }}>
                                {entryWatch.emoji ?? "⌚"} {entryWatch.brand} {entryWatch.model}
                              </span>
                            )}
                          </div>
                          {entry.notes && (
                            <div style={{ fontSize: 10, color: muted, fontStyle: "italic" }}>{entry.notes}</div>
                          )}
                          {(entry.garmentIds?.length > 0) && (() => {
                            const wornGs = entry.garmentIds.map(id => garments.find(g => g.id === id)).filter(Boolean);
                            return (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                                {wornGs.map(g => {
                                  const photo = g.thumbnail || g.photoUrl;
                                  return (
                                    <div key={g.id} style={{
                                      display: "flex", alignItems: "center", gap: 4,
                                      padding: "2px 6px", borderRadius: 6,
                                      background: isDark ? "#171a2188" : "#f3f4f688",
                                      border: `1px solid ${border}`,
                                      fontSize: 10,
                                    }}>
                                      {photo ? (
                                        <img src={photo} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }} />
                                      ) : (
                                        <span style={{ fontSize: 10 }}>{SLOT_ICONS[normalizeType(g.type ?? "")] ?? "•"}</span>
                                      )}
                                      <span style={{ color: text, fontWeight: 600 }}>{g.color ?? ""} {g.type ?? ""}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {/* Add Another Outfit button */}
                    <button
                      onClick={() => setPendingAddOutfit(day)}
                      style={{
                        width: "100%", padding: "8px 0", borderRadius: 8,
                        background: "transparent",
                        color: isDark ? "#3b82f6" : "#2563eb",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1px dashed ${isDark ? "#3b82f6" : "#93c5fd"}`,
                        marginTop: 4,
                      }}
                    >
                      + Add Another Outfit
                    </button>
                  </div>
                );
              })()}

              {day.backup && (
                <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${border}` }}>
                  <div style={{ fontSize:10, color:sub, marginBottom:3 }}>Backup</div>
                  <WatchMini watch={day.backup} isDark={isDark} isOnCall={false}
                    daysSince={day.backup ? daysSinceWorn(day.backup.id, history) : null} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCalendar && (
        <OnCallCalendar
          onCallDates={onCallDates}
          onToggle={handleToggleOnCall}
          isDark={isDark}
        />
      )}

      {/* Notes + photo modal */}
      {pendingLog && (
        <LogConfirmModal
          isDark={isDark}
          onCancel={() => setPendingLog(null)}
          onConfirm={({ notes, photos }) => {
            const { day, garmentIds } = pendingLog;
            addEntry({
              id: `rotation-${Date.now()}`,
              date: day.date,
              watchId: day.watch.id,
              garmentIds,
              context: day.ctx,
              notes: notes ?? null,
              outfitPhoto: photos[0] ?? null,
              outfitPhotos: photos.length ? photos : null,
              loggedAt: new Date().toISOString(),
            });
            // Feed style learning — resolve garment objects from IDs
            const wornG = garmentIds.map(id => garments.find(g => g.id === id)).filter(Boolean);
            if (wornG.length > 0) {
              import("../stores/styleLearnStore.js").then(({ useStyleLearnStore }) => {
                useStyleLearnStore.getState().recordWear(wornG);
              }).catch(() => {});
            }
            setPendingLog(null);
          }}
        />
      )}

      {/* Add Another Outfit modal */}
      {pendingAddOutfit && (
        <AddOutfitModal
          isDark={isDark}
          watches={watches}
          garments={garments}
          day={pendingAddOutfit}
          forecast={forecast}
          history={history}
          wearable={wearable}
          slotCandidates={slotCandidates}
          onCancel={() => setPendingAddOutfit(null)}
          onConfirm={({ timeSlot, watchId, notes, garmentIds, context }) => {
            addEntry({
              id: `rotation-${pendingAddOutfit.date}-${timeSlot}-${Date.now()}`,
              date: pendingAddOutfit.date,
              watchId,
              garmentIds: garmentIds ?? [],
              context: context ?? pendingAddOutfit.ctx ?? null,
              timeSlot,
              notes: notes ?? null,
              loggedAt: new Date().toISOString(),
            });
            // Feed style learning for worn garments
            if (garmentIds?.length > 0) {
              const wornG = garmentIds.map(id => garments.find(g => g.id === id)).filter(Boolean);
              if (wornG.length > 0) {
                import("../stores/styleLearnStore.js").then(({ useStyleLearnStore }) => {
                  useStyleLearnStore.getState().recordWear(wornG);
                }).catch(() => {});
              }
            }
            setPendingAddOutfit(null);
          }}
        />
      )}
    </div>
  );
}
