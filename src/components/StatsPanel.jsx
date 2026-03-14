/**
 * StatsPanel — wear analytics
 * Colors worn frequency, watch rotation, garment usage, context breakdown
 */
import React, { useMemo, useState } from "react";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useThemeStore }    from "../stores/themeStore.js";
import { utilizationScore } from "../domain/rotationStats.js";

const COLOR_SWATCH = {
  black:"#1f2937", white:"#f3f4f6", navy:"#1e3a5f", blue:"#2563eb", grey:"#9ca3af",
  brown:"#78350f", tan:"#d4a574", khaki:"#c4b96a", beige:"#d6cfc0", cream:"#f5f0e0",
  green:"#16a34a", olive:"#65730a", teal:"#0d9488", burgundy:"#6b1d1d", red:"#dc2626",
  pink:"#ec4899", orange:"#f97316", yellow:"#eab308", purple:"#9333ea", charcoal:"#374151",
  "dark brown":"#78350f", "light blue":"#bfdbfe", "dark navy":"#0f172a",
};

function colorOf(c) { return COLOR_SWATCH[c?.toLowerCase()] ?? "#6b7280"; }

// ── Bar chart row ─────────────────────────────────────────────────────────────
function BarRow({ label, count, max, color, isDark, emoji }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 100, fontSize: 12, color: text, fontWeight: 600, flexShrink: 0, display: "flex", gap: 5, alignItems: "center" }}>
        {emoji && <span>{emoji}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div style={{ flex: 1, height: 12, borderRadius: 6, background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6,
                      background: color ?? "#3b82f6", transition: "width 0.4s ease" }} />
      </div>
      <div style={{ width: 28, textAlign: "right", fontSize: 12, color: muted, flexShrink: 0 }}>{count}</div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, isDark }) {
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  return (
    <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.08em", marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

// ── Mini calendar heatmap (last 90 days) ─────────────────────────────────────
function WearCalendar({ entries, isDark }) {
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const today  = new Date();

  // Build 90-day grid
  const days = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    const count = entries.filter(e => e.date === iso).length;
    days.push({ iso, count, label: d.toLocaleDateString("en-US", { month:"short", day:"numeric" }) });
  }

  const maxCount = Math.max(...days.map(d => d.count), 1);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {days.map(d => {
          const intensity = d.count / maxCount;
          const bg = d.count === 0
            ? (isDark ? "#1a1f2b" : "#e5e7eb")
            : `rgba(59,130,246,${0.2 + intensity * 0.8})`;
          return (
            <div key={d.iso} title={`${d.label}: ${d.count} outfit${d.count !== 1 ? "s" : ""}`}
              style={{ width: 10, height: 10, borderRadius: 2, background: bg,
                       border: d.iso === today.toISOString().split("T")[0] ? `1px solid #3b82f6` : "none",
                       cursor: "default" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6,
                    fontSize: 10, color: isDark ? "#4b5563" : "#9ca3af" }}>
        <span>90 days ago</span><span>Today</span>
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const { mode }  = useThemeStore();
  const isDark    = mode === "dark";
  const entries   = useHistoryStore(s => s.entries);
  const garments  = useWardrobeStore(s => s.garments);
  const watches   = useWatchStore(s => s.watches);
  const [range, setRange] = useState(30); // days

  const bg   = isDark ? "#101114" : "#f9fafb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const card  = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";

  const cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - range);
    return d.toISOString().split("T")[0];
  }, [range]);

  const filtered = useMemo(() => entries.filter(e => (e.date ?? "") >= cutoff), [entries, cutoff]);

  // O(1) garment lookup map — avoids repeated .find() inside loops
  const garmentMap = useMemo(() => {
    const m = {};
    garments.forEach(g => { m[g.id] = g; });
    return m;
  }, [garments]);

  // ── Watch wear frequency ────────────────────────────────────────────────────
  const watchFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(e => { if (e.watchId) freq[e.watchId] = (freq[e.watchId] ?? 0) + 1; });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, n, watch: watches.find(w => w.id === id) }))
      .filter(x => x.watch);
  }, [filtered, watches]);

  // ── Color worn frequency (from garment history) ─────────────────────────────
  const colorFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(e => {
      (e.garmentIds ?? []).forEach(gid => {
        const g = garmentMap[gid];
        if (g?.color) freq[g.color] = (freq[g.color] ?? 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [filtered, garmentMap]);

  // ── Garment type breakdown ──────────────────────────────────────────────────
  const typeFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(e => {
      (e.garmentIds ?? []).forEach(gid => {
        const g = garmentMap[gid];
        if (g?.type) freq[g.type] = (freq[g.type] ?? 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [filtered, garmentMap]);

  // ── Most worn individual garments ───────────────────────────────────────────
  const garmentFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(e => {
      (e.garmentIds ?? []).forEach(gid => { freq[gid] = (freq[gid] ?? 0) + 1; });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, n]) => ({ id, n, garment: garmentMap[id] }))
      .filter(x => x.garment);
  }, [filtered, garmentMap]);

  // ── Context breakdown ───────────────────────────────────────────────────────
  const contextFreq = useMemo(() => {
    const freq = {};
    filtered.forEach(e => { if (e.context) freq[e.context] = (freq[e.context] ?? 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const CONTEXT_LABELS = { "smart-casual":"Smart Casual", "hospital-smart-casual":"Clinic",
    formal:"Formal", casual:"Casual", shift:"On-Call" };
  const CONTEXT_EMOJIS = { "smart-casual":"👔", "hospital-smart-casual":"🏥", formal:"🎩", casual:"👕", shift:"🚨" };


  // ── Wear streak ────────────────────────────────────────────────────────────
  const { streak, last7, last30 } = useMemo(() => {
    const allDates = entries.map(e => e.date).filter(Boolean);
    const uniqueDates = [...new Set(allDates)].sort().reverse();
    let s = 0;
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dk = d.toISOString().split("T")[0];
      if (uniqueDates.includes(dk)) s++;
      else if (i === 0) continue; // allow missing today
      else break;
    }
    const nowStr = today.toISOString().split("T")[0];
    const weekAgo  = new Date(today); weekAgo.setDate(weekAgo.getDate()-7);  const wk = weekAgo.toISOString().split("T")[0];
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate()-30); const mo = monthAgo.toISOString().split("T")[0];
    return {
      streak: s,
      last7:  allDates.filter(d => d >= wk).length,
      last30: allDates.filter(d => d >= mo).length,
    };
  }, [entries]);

  // ── Cost per wear (simple — used in Most Worn inline) ──────────────────────
  const cpwItemsSimple = useMemo(() => {
    return garments
      .filter(g => g.price > 0)
      .map(g => {
        const wears = Math.max(1, entries.filter(e => (e.garmentIds ?? []).includes(g.id)).length);
        return { g, wears, cpw: Math.round(g.price / wears) };
      })
      .sort((a, b) => a.cpw - b.cpw);
  }, [garments, entries]);

  const maxWatch   = Math.max(...watchFreq.map(x => x.n), 1);
  const maxColor   = Math.max(...colorFreq.map(x => x[1]), 1);
  const maxType    = Math.max(...typeFreq.map(x => x[1]), 1);
  const maxGarment = Math.max(...garmentFreq.map(x => x.n), 1);
  const maxCtx     = Math.max(...contextFreq.map(x => x[1]), 1);

  // ── Cold bench: garments not worn in 30+ days ───────────────────────────────
  const coldBench = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return garments
      .filter(g => !g.excludeFromWardrobe && !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type))
      .map(g => {
        const worn = entries.filter(e => (e.garmentIds ?? []).includes(g.id));
        const lastWorn = worn.length > 0 ? worn.sort((a,b) => b.date.localeCompare(a.date))[0].date : null;
        const daysSince = lastWorn ? Math.floor((Date.now() - new Date(lastWorn).getTime()) / 864e5) : 999;
        return { g, lastWorn, daysSince, wears: worn.length };
      })
      .filter(x => x.daysSince >= 30)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 8);
  }, [garments, entries]);
  const cpwItems = useMemo(() => {
    return garments
      .filter(g => g.price > 0)
      .map(g => {
        const wears = entries.filter(e => (e.garmentIds ?? []).includes(g.id)).length;
        if (!wears) return null;
        return { garment: g, wears, cpw: Math.round(g.price / wears) };
      })
      .filter(Boolean)
      .sort((a, b) => a.cpw - b.cpw)
      .slice(0, 8);
  }, [garments, entries]);

  const utilization = useMemo(() => utilizationScore(watches, entries), [watches, entries]);

  return (
    <div style={{ padding: "0 0 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: text }}>Statistics</div>
          <div style={{ fontSize: 13, color: muted }}>{filtered.length} logged outfits</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setRange(d)}
              style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${range === d ? "#3b82f6" : border}`,
                       background: range === d ? "#3b82f622" : "transparent",
                       color: range === d ? "#3b82f6" : muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 6 }}>No data yet</div>
          <div style={{ fontSize: 13 }}>Log outfits from the Today tab to see your stats here.</div>
        </div>
      ) : (
        <>
          {/* Wear heatmap */}
          <Section title="Wear Activity — last 90 days" isDark={isDark}>
            <WearCalendar entries={entries} isDark={isDark} />
          </Section>

          {/* Watch rotation */}
          {watchFreq.length > 0 && (
            <Section title="Watch Rotation" isDark={isDark}>
              {watchFreq.map(({ id, n, watch: w }) => (
                <BarRow key={id} label={`${w.brand} ${w.model}`} count={n} max={maxWatch}
                  color="#3b82f6" emoji={w.emoji ?? "⌚"} isDark={isDark} />
              ))}
            </Section>
          )}

          {/* Color palette worn */}
          {colorFreq.length > 0 && (
            <Section title="Colors Worn" isDark={isDark}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {colorFreq.map(([c, n]) => (
                  <div key={c} title={`${c}: ${n}×`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: colorOf(c),
                                  border: `2px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
                                  boxShadow: "inset 0 0 0 1px #00000022" }} />
                    <div style={{ fontSize: 10, color: muted }}>{n}×</div>
                  </div>
                ))}
              </div>
              {colorFreq.map(([c, n]) => (
                <BarRow key={c} label={c} count={n} max={maxColor} color={colorOf(c)} isDark={isDark} />
              ))}
            </Section>
          )}

          {/* Most worn garments */}
          {garmentFreq.length > 0 && (
            <Section title="Most Worn Pieces" isDark={isDark}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8, marginBottom: 12 }}>
                {garmentFreq.slice(0, 6).map(({ id, n, garment: g }) => (
                  <div key={id} style={{ textAlign: "center" }}>
                    <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${border}`,
                                  marginBottom: 4, position: "relative" }}>
                      {(g.thumbnail || g.photoUrl) ? (
                        <img src={g.thumbnail || g.photoUrl}
                          style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center",
                                      justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6", fontSize: 20 }}>👕</div>
                      )}
                      <div style={{ position: "absolute", top: 4, right: 4, background: "#3b82f6", color: "#fff",
                                    borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 5px" }}>{n}×</div>
                    </div>
                    <div style={{ fontSize: 9, color: muted, lineHeight: 1.3 }}>{g.name?.slice(0,14)}</div>
                  </div>
                ))}
              </div>
              {garmentFreq.map(({ id, n, garment: g }) => (
                <BarRow key={id} label={g.name ?? "Garment"} count={n} max={maxGarment} color="#8b5cf6" isDark={isDark} />
              ))}
            </Section>
          )}

          {/* Cold Bench — items not worn in 30+ days */}
          {coldBench.length > 0 && (
            <Section title={`Cold Bench — ${coldBench.length} piece${coldBench.length !== 1 ? "s" : ""} sitting unused`} isDark={isDark}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(72px,1fr))", gap:8, marginBottom:8 }}>
                {coldBench.map(({ g, daysSince, wears }) => (
                  <div key={g.id} style={{ textAlign:"center" }}>
                    <div style={{ borderRadius:10, overflow:"hidden",
                                  border:`1px solid ${daysSince >= 60 ? "#ef4444" : "#f59e0b"}44`,
                                  marginBottom:4, position:"relative" }}>
                      {(g.thumbnail || g.photoUrl) ? (
                        <img src={g.thumbnail || g.photoUrl}
                          style={{ width:"100%", aspectRatio:"3/4", objectFit:"cover", display:"block", opacity:0.75 }} />
                      ) : (
                        <div style={{ width:"100%", aspectRatio:"3/4", display:"flex", alignItems:"center",
                                      justifyContent:"center", background:isDark?"#0f131a":"#f3f4f6", fontSize:20 }}>👕</div>
                      )}
                      <div style={{ position:"absolute", top:4, right:4,
                                    background: daysSince >= 60 ? "#ef4444" : "#f59e0b",
                                    color:"#fff", borderRadius:20, fontSize:9, fontWeight:700, padding:"1px 5px" }}>
                        {daysSince >= 999 ? "never" : `${daysSince}d`}
                      </div>
                    </div>
                    <div style={{ fontSize:9, color:muted, lineHeight:1.3 }}>{g.name?.slice(0,13)}</div>
                    <div style={{ fontSize:9, color:isDark?"#4b5563":"#9ca3af" }}>{wears}× total</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color:muted }}>
                🔴 Red = 60+ days idle &nbsp; 🟡 Yellow = 30–59 days
              </div>
            </Section>
          )}

          {/* Garment type breakdown */}
          {typeFreq.length > 0 && (
            <Section title="Garment Types" isDark={isDark}>
              {typeFreq.map(([t, n]) => (
                <BarRow key={t} label={t} count={n} max={maxType} color="#10b981" isDark={isDark} />
              ))}
            </Section>
          )}

          {/* Context breakdown */}
          {contextFreq.length > 0 && (
            <Section title="Outfit Contexts" isDark={isDark}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {contextFreq.map(([ctx, n]) => {
                  const total = filtered.length;
                  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                  return (
                    <div key={ctx} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                                            background: isDark ? "#1a1f2b" : "#f3f4f6", color: text }}>
                      {CONTEXT_EMOJIS[ctx] ?? "•"} {CONTEXT_LABELS[ctx] ?? ctx} — {pct}%
                    </div>
                  );
                })}
              </div>
              {contextFreq.map(([ctx, n]) => (
                <BarRow key={ctx} label={CONTEXT_LABELS[ctx] ?? ctx} count={n} max={maxCtx}
                  color="#f59e0b" emoji={CONTEXT_EMOJIS[ctx]} isDark={isDark} />
              ))}
            </Section>
          )}


          {/* ── Collection Utilization ────────────────────────────────────── */}
          <Section title="Collection Utilization" isDark={isDark}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                            alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: text, fontWeight: 700 }}>
                  {utilization}% of collection worn
                </span>
                <span style={{ fontSize: 11, color: muted }}>
                  {new Set(entries.map(e => e.watchId).filter(Boolean)).size} of {watches.length} watches
                </span>
              </div>
              <div style={{ width: "100%", height: 10, borderRadius: 5,
                            background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden" }}>
                <div style={{
                  width: `${utilization}%`, height: "100%", borderRadius: 5,
                  background: utilization >= 80 ? "#22c55e"
                            : utilization >= 50 ? "#f59e0b"
                            : "#ef4444",
                  transition: "width 0.6s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>
                {utilization === 100
                  ? "Every watch has seen wrist time — full rotation achieved."
                  : utilization >= 80
                  ? "Strong rotation. A few watches waiting their turn."
                  : utilization >= 50
                  ? "Over half the collection active. Some pieces sitting idle."
                  : "Low rotation. Many watches unworn — check the Rotation tab."}
              </div>
            </div>
          </Section>

          {/* ── Streaks + CPW ─────────────────────────────────────────────── */}
          <Section title="Habit & Value" isDark={isDark}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
              {[
                { label:"Day Streak", value:streak, icon:"🔥", color:"#f59e0b" },
                { label:"This Week",  value:last7,  icon:"📅", color:"#3b82f6" },
                { label:"This Month", value:last30, icon:"🗓️", color:"#10b981" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} style={{ textAlign:"center", padding:"12px 4px",
                                          background:isDark?"#0f131a":"#f3f4f6", borderRadius:10 }}>
                  <div style={{ fontSize:22, marginBottom:2 }}>{icon}</div>
                  <div style={{ fontSize:24, fontWeight:900, color }}>{value}</div>
                  <div style={{ fontSize:10, color:muted, marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
            {cpwItemsSimple.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:muted, textTransform:"uppercase",
                              letterSpacing:"0.06em", marginBottom:8 }}>Cost Per Wear</div>
                {cpwItemsSimple.slice(0,8).map(({ g, cpw, wears }) => (
                  <div key={g.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                    {(g.thumbnail||g.photoUrl)
                      ? <img src={g.thumbnail||g.photoUrl} style={{ width:28,height:36,objectFit:"cover",borderRadius:4,flexShrink:0 }} />
                      : <div style={{ width:28,height:36,borderRadius:4,background:isDark?"#1a1f2b":"#e5e7eb",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>👕</div>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</div>
                      <div style={{ fontSize:10, color:muted }}>{wears} wear{wears!==1?"s":""}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:800,
                                  color: cpw <= 5 ? "#10b981" : cpw <= 20 ? "#f59e0b" : "#ef4444" }}>
                      ~₪{cpw}/w
                    </div>
                  </div>
                ))}
              </>
            )}
          </Section>

          {/* Summary card */}
          <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                          letterSpacing: "0.08em", marginBottom: 12 }}>Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
              {[
                { label: "Outfits logged", value: filtered.length },
                { label: "Watches rotated", value: watchFreq.length },
                { label: "Colors worn", value: colorFreq.length },
                { label: "Pieces worn", value: garmentFreq.length },
                { label: "Day streak 🔥", value: streak },
                { label: "This week", value: last7 },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center", padding: "12px 0",
                                          background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 10 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#3b82f6" }}>{value}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CPW leaderboard */}
          {cpwItems.length > 0 && (
            <Section title="Cost-per-Wear (best value)" isDark={isDark}>
              {cpwItems.slice(0, 6).map(({ garment: g, cpw, wears }) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 48, borderRadius: 6, overflow: "hidden", flexShrink: 0,
                                border: `1px solid ${border}` }}>
                    {(g.thumbnail || g.photoUrl) ? (
                      <img src={g.thumbnail || g.photoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                                    justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6", fontSize: 16 }}>👕</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: text,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ fontSize: 10, color: muted }}>{wears} wear{wears !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80",
                                background: "#052e16", borderRadius: 8, padding: "3px 9px" }}>~{cpw}/w</div>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
