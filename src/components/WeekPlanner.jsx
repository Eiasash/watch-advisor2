import React, { useState, useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useStrapStore }   from "../stores/strapStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { genWeekRotation } from "../engine/weekRotation.js";
import { setCachedState } from "../services/localCache.js";

const DAY_NAMES_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CONTEXTS = [
  { key:"smart-casual",            label:"Smart Casual" },
  { key:"hospital-smart-casual",   label:"Clinic/Hospital" },
  { key:"formal",                  label:"Formal" },
  { key:"casual",                  label:"Casual" },
  { key:"shift",                   label:"On-Call Shift" },
];

function WatchMini({ watch, label, isDark, isOnCall }) {
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
        {watch.emoji ?? "⌚"}
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:isDark?"#e2e8f0":"#111827", lineHeight:1.2 }}>
          {watch.brand ?? ""} {watch.model ?? watch.name ?? "Watch"}
        </div>
        <div style={{ fontSize:10, color:isDark?"#6b7280":"#9ca3af" }}>
          {watch.dial ?? ""} dial
          {label && <span style={{ color:accent, marginLeft:4 }}>{label}</span>}
        </div>
      </div>
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
    // pad start (Mon = 0 here)
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
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>‹</button>
          <span style={{ fontSize:12, fontWeight:600, color:text, minWidth:120, textAlign:"center" }}>{monthLabel}</span>
          <button onClick={() => setViewDate(({ year:y, month:m }) => m===11 ? {year:y+1,month:0} : {year:y,month:m+1})}
            style={{ background:"none", border:"none", color:text, cursor:"pointer", fontSize:16 }}>›</button>
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
          🟠 {onCallDates.filter(d => d >= todayIso).sort().slice(0,4).join("  ")}
          {onCallDates.filter(d => d >= todayIso).length > 4 ? " …" : ""}
        </div>
      )}
    </div>
  );
}

// ── Main WeekPlanner ──────────────────────────────────────────────────────────
export default function WeekPlanner() {
  const watches    = useWatchStore(s => s.watches);
  const history    = useHistoryStore(s => s.entries);
  const weekCtx    = useWardrobeStore(s => s.weekCtx);
  const onCallDates= useWardrobeStore(s => s.onCallDates);
  const setWeekCtx = useWardrobeStore(s => s.setWeekCtx);
  const setOnCallDates = useWardrobeStore(s => s.setOnCallDates);
  const garments     = useWardrobeStore(s => s.garments);
  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const { mode }     = useThemeStore();
  const isDark     = mode === "dark";
  const [showCalendar, setShowCalendar] = useState(false);
  // Per-day watch overrides { [offset]: watchId }
  const [watchOverrides, setWatchOverrides] = useState({});
  const [strapOverrides, setStrapOverrides] = useState({}); // { [offset]: strapId }
  const [pickingDay, setPickingDay]         = useState(null); // offset of day with open picker

  const rotation = useMemo(
    () => genWeekRotation(watches, history, weekCtx, onCallDates),
    [watches, history, weekCtx, onCallDates]
  );

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

  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#6b7280" : "#9ca3af";

  return (
    <div style={{ padding:"18px 20px", borderRadius:16, background:bg, border:`1px solid ${border}`, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:text }}>7-Day Watch Rotation</h2>
        <button onClick={() => setShowCalendar(v => !v)} style={{
          background:showCalendar?"#f9731622":"transparent", border:`1px solid ${showCalendar?"#f97316":border}`,
          color:showCalendar?"#f97316":sub, borderRadius:8, padding:"5px 12px",
          fontSize:12, fontWeight:600, cursor:"pointer",
        }}>
          🟠 On-Call {onCallDates.length > 0 ? `(${onCallDates.filter(d=>d>=today).length})` : ""}
        </button>
      </div>

      {/* Day cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {rotation.map(day => {
          const isToday = day.date === today;
          const cardBg = day.isOnCall
            ? (isDark ? "#1a1400" : "#fff8f0")
            : isToday ? (isDark ? "#0d1929" : "#eff6ff")
            : (isDark ? "#0f131a" : "#f9fafb");
          const cardBorder = day.isOnCall ? "#f97316" : isToday ? "#3b82f6" : border;

          return (
            <div key={day.offset} style={{
              borderRadius:12, padding:"12px 14px",
              background:cardBg, border:`1px solid ${cardBorder}`,
            }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontWeight:700, fontSize:13, color:text }}>
                    {isToday ? "Today" : day.dayName}
                  </span>
                  <span style={{ fontSize:11, color:sub }}>{day.date.slice(5)}</span>
                  {day.isOnCall && (
                    <span style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                                   background:"#f97316", color:"#fff" }}>ON-CALL</span>
                  )}
                </div>
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
              <WatchMini watch={day.watch} isDark={isDark} isOnCall={day.isOnCall}
                label={day.isOverridden ? "overridden" : null} />

              {/* Watch override picker */}
              <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => setPickingDay(pickingDay === day.offset ? null : day.offset)}
                  style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                            border: `1px solid ${day.isOverridden ? "#3b82f6" : border}`,
                            background: day.isOverridden ? "#3b82f622" : "transparent",
                            color: day.isOverridden ? "#3b82f6" : sub, fontWeight: 600 }}>
                  {day.isOverridden ? "⌚ Change" : "⌚ Override"}
                </button>
                {day.isOverridden && (
                  <button onClick={() => setWatchOverrides(o => { const n = {...o}; delete n[day.offset]; return n; })}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                              border: `1px solid ${border}`, background: "transparent", color: "#ef4444", fontWeight: 600 }}>
                    Reset
                  </button>
                )}
              </div>

              {/* Watch picker dropdown */}
              {pickingDay === day.offset && (
                <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 10,
                              background: isDark ? "#171a21" : "#fff", overflow: "hidden" }}>
                  {watches.map(w => {
                    const isSelected = (watchOverrides[day.offset] ?? rotation[day.offset]?.watch?.id) === w.id;
                    return (
                      <div key={w.id}>
                        <div onClick={() => {
                          setWatchOverrides(o => ({ ...o, [day.offset]: w.id }));
                          // Clear strapOverride when switching watch
                          setStrapOverrides(o => { const n = {...o}; delete n[day.offset]; return n; });
                          setPickingDay(null);
                        }}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer",
                                    background: isSelected ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent",
                                    borderBottom: `1px solid ${border}` }}>
                          <span style={{ fontSize: 16 }}>{w.emoji ?? "⌚"}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                            <div style={{ fontSize: 10, color: sub }}>{w.dial} · {w.replica ? "replica" : "genuine"}</div>
                          </div>
                          {isSelected && <span style={{ color: "#3b82f6", fontWeight: 700 }}>✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Strap picker — shown when a watch is assigned (overridden or auto) */}
              {(() => {
                const dayWatchId = watchOverrides[day.offset] ?? day.watch?.id;
                if (!dayWatchId) return null;
                const dayStraps = Object.values(straps).filter(s => s.watchId === dayWatchId);
                if (dayStraps.length <= 1) return null; // nothing to choose
                const activeStrapId = strapOverrides[day.offset]
                  ?? Object.values(straps).find(s => s.watchId === dayWatchId && activeStrap[dayWatchId] === s.id)?.id
                  ?? dayStraps[0]?.id;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: sub, fontWeight: 600, marginBottom: 5 }}>STRAP</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {dayStraps.map(s => {
                        const isActive = activeStrapId === s.id;
                        return (
                          <button key={s.id}
                            onClick={() => setStrapOverrides(o => ({ ...o, [day.offset]: s.id }))}
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

              {day.backup && (
                <div style={{ marginTop:6, paddingTop:6, borderTop:`1px solid ${border}` }}>
                  <div style={{ fontSize:10, color:sub, marginBottom:3 }}>Backup</div>
                  <WatchMini watch={day.backup} isDark={isDark} isOnCall={false} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* On-call calendar */}
      {showCalendar && (
        <OnCallCalendar
          onCallDates={onCallDates}
          onToggle={handleToggleOnCall}
          isDark={isDark}
        />
      )}
    </div>
  );
}
