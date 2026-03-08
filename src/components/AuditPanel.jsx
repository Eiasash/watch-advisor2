import React, { useState, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { pushGarment, deleteGarment as deleteGarmentCloud } from "../services/supabaseSync.js";
import { getCachedState, setCachedState } from "../services/localCache.js";
import { enqueueTask, getPendingTasks, subscribeQueue } from "../services/backgroundQueue.js";

async function runAudit(garments, watches, history) {
  const garmentsSummary = garments
    .filter(g => g.type !== "outfit-photo" && !g.excludeFromWardrobe)
    .map(g => `[${g.type}] ${g.name}${g.brand ? " (" + g.brand + ")" : ""} — ${g.color ?? "?"} (formality ${g.formality ?? 5}/10)${g.notes ? " | " + g.notes : ""}`)
    .join("\n");

  const colorCounts = {};
  garments.forEach(g => { if (g.color) colorCounts[g.color] = (colorCounts[g.color] ?? 0) + 1; });
  const colorSummary = Object.entries(colorCounts).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c} ×${n}`).join(", ");

  const typeCounts = {};
  garments.forEach(g => { if (g.type) typeCounts[g.type] = (typeCounts[g.type] ?? 0) + 1; });
  const typeSummary = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t} ×${n}`).join(", ");

  const watchSummary = watches.map(w =>
    `${w.brand ?? ""} ${w.model ?? w.name ?? "Watch"} — ${w.dial ?? "?"} dial, formality ${w.formality ?? 5}/10${w.genuine === false ? " [replica]" : " [genuine]"}`
  ).join("\n");

  const wearFreq = {};
  history.forEach(e => { if (e.watchId) wearFreq[e.watchId] = (wearFreq[e.watchId] ?? 0) + 1; });
  const watchWears = Object.entries(wearFreq).sort((a,b)=>b[1]-a[1])
    .map(([id,n]) => { const w = watches.find(x => x.id === id); return (w ? `${w.brand} ${w.model}` : id) + ` ×${n}`; })
    .join(", ");

  // Garment wear frequency from history
  const garmentWearFreq = {};
  history.forEach(e => (e.garmentIds ?? []).forEach(gid => {
    garmentWearFreq[gid] = (garmentWearFreq[gid] ?? 0) + 1;
  }));
  const today = new Date().toISOString().split("T")[0];
  const neglectedGarments = garments
    .filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo")
    .filter(g => {
      if (!g.lastWorn) return true; // never worn
      const d = Math.floor((Date.now() - new Date(g.lastWorn).getTime()) / 864e5);
      return d > 30;
    })
    .map(g => `${g.name} (${g.type}, ${g.color})${g.lastWorn ? ` — last worn ${g.lastWorn}` : " — never worn"}`);

  const topWornGarments = Object.entries(garmentWearFreq)
    .sort((a,b) => b[1]-a[1]).slice(0, 8)
    .map(([id,n]) => { const g = garments.find(x => x.id === id); return (g ? g.name : id) + ` ×${n}`; })
    .join(", ");

  const prompt = `You are a luxury men's wardrobe consultant for a watch collector. Perform a comprehensive audit.

WARDROBE (${garments.length} garments):
Types: ${typeSummary}
Colors: ${colorSummary}
Items:
${garmentsSummary.slice(0, 3000)}

WATCHES (${watches.length} pieces):
${watchSummary}

WEAR LOG: ${history.length} entries
Watch wear frequency: ${watchWears || "none recorded"}
Most worn garments (last 60 days): ${topWornGarments || "none recorded"}
Neglected garments (30+ days or never worn, ${neglectedGarments.length} items): ${neglectedGarments.slice(0, 10).join("; ") || "none"}

OWNER CONTEXT:
- Hospital-based physician: clinic days require genuine watches + formal attire
- Watch philosophy: genuine for understated prestige, replicas for bold dial colors in casual/date contexts
- Strap-shoe rule: brown leather strap = brown shoes. Black strap = black shoes. Non-negotiable.

Provide a precise, critical wardrobe audit. Reference specific items. Return ONLY valid JSON:
{
  "grade": "A+/A/B+/B/C+/C/D/F",
  "grade_why": "2 sentence rationale referencing specific strengths/weaknesses",
  "color_harmony": "Palette analysis — warm/cool balance, dominant tones, gaps (2 sentences)",
  "color_score": 1-10,
  "versatility": "How many distinct looks are possible, cross-functionality (2 sentences)",
  "versatility_score": 1-10,
  "watch_wardrobe_synergy": "How watches complement wardrobe — dial color matches and gaps (2-3 sentences)",
  "synergy_score": 1-10,
  "gaps": ["up to 4 specific missing items with exact color and type"],
  "declutter": ["up to 4 redundant or low-utility items to consider removing"],
  "invest": ["up to 4 specific items worth buying with color and price tier"],
  "style_identity": "Style archetype this wardrobe represents (1 sentence)",
  "pro_tip": "One advanced watch-wardrobe coordination insight specific to this collection (1-2 sentences)"
}`;

  const res = await fetch("/.netlify/functions/ai-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`AI audit failed: ${res.status}`);
  const data = await res.json();
  return data;
}

function ScoreBar({ score, isDark }) {
  const color = score >= 8 ? "#22c55e" : score >= 6 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:5, borderRadius:3, background:isDark?"#2b3140":"#e5e7eb" }}>
        <div style={{ width:`${score*10}%`, height:"100%", borderRadius:3, background:color, transition:"width 0.6s" }} />
      </div>
      <span style={{ fontSize:12, fontWeight:700, color }}>{score}/10</span>
    </div>
  );
}

function Section({ title, items, color = "#3b82f6", isDark }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:12, fontWeight:700, color, marginBottom:5, textTransform:"uppercase", letterSpacing:"0.05em" }}>
        {title}
      </div>
      <ul style={{ margin:0, paddingLeft:16 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize:13, color:isDark?"#a1a9b8":"#4b5563", marginBottom:3, lineHeight:1.5 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuditPanel() {
  const garments = useWardrobeStore(s => s.garments);
  const watches  = useWatchStore(s => s.watches);
  const history  = useHistoryStore(s => s.entries);
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";

  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Restore cached audit result on mount
  useEffect(() => {
    getCachedState().then(cached => {
      if (cached._auditResult && cached._auditResult.grade) {
        setResult(cached._auditResult);
        setExpanded(false);
      }
    }).catch(() => {});
  }, []);

  async function handleAudit() {
    if (garments.length < 3) {
      setError("Import at least 3 garments first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await runAudit(garments.filter(g => !g.excludeFromWardrobe), watches, history);
      setResult(res);
      setExpanded(true);
      setCachedState({ _auditResult: res }).catch(() => {});
    } catch (e) {
      setError(e.message || "Audit failed");
    }
    setLoading(false);
  }

  const bg     = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";

  const gradeColor = result ? (
    result.grade?.startsWith("A") ? "#22c55e" :
    result.grade?.startsWith("B") ? "#f59e0b" :
    result.grade?.startsWith("C") ? "#f97316" : "#ef4444"
  ) : "#6b7280";

  return (
    <div style={{ padding:"18px 20px", borderRadius:16, background:bg, border:`1px solid ${border}`, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <h2 style={{ margin:0, fontSize:17, fontWeight:700, color:text }}>AI Wardrobe Audit</h2>
        {result && (
          <span style={{ fontSize:24, fontWeight:900, color:gradeColor }}>{result.grade}</span>
        )}
      </div>

      {!expanded && (
        <div style={{ fontSize:13, color:sub, marginBottom:14, lineHeight:1.6 }}>
          Get a full analysis of your wardrobe: color harmony, watch-wardrobe synergy, gaps to fill,
          items to declutter, and a watch-first styling assessment.
        </div>
      )}

      <button
        onClick={handleAudit}
        disabled={loading}
        style={{
          padding:"10px 22px", borderRadius:10, border:"none",
          background: loading ? "#1e3a5f" : "#8b5cf6",
          color:"#fff", fontWeight:700, fontSize:13, cursor: loading ? "wait" : "pointer",
          marginBottom:14,
        }}
      >
        {loading ? "Analysing wardrobe…" : result ? "Re-run Audit" : "Run AI Audit"}
      </button>

      {error && <div style={{ fontSize:13, color:"#ef4444", marginBottom:10 }}>{error}</div>}

      {result && expanded && (
        <div>
          {/* Grade rationale */}
          <div style={{
            padding:"12px 14px", borderRadius:10, marginBottom:14,
            background:isDark?"#0f131a":"#f5f3ff", borderLeft:"3px solid #8b5cf6",
            fontSize:13, color:isDark?"#c4b5fd":"#5b21b6", lineHeight:1.6,
          }}>
            {result.grade_why}
          </div>

          {/* Scores */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
            {[
              { label:"Color Harmony", score:result.color_score },
              { label:"Versatility",   score:result.versatility_score },
              { label:"Watch Synergy", score:result.synergy_score },
            ].map(({ label, score }) => score != null && (
              <div key={label} style={{ padding:"8px 10px", borderRadius:8, background:isDark?"#0f131a":"#f9fafb", border:`1px solid ${border}` }}>
                <div style={{ fontSize:10, fontWeight:700, color:sub, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                <ScoreBar score={score} isDark={isDark} />
              </div>
            ))}
          </div>

          {/* Text sections */}
          {result.color_harmony && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#8b5cf6", marginBottom:4 }}>COLOR PALETTE</div>
              <p style={{ margin:0, fontSize:13, color:isDark?"#a1a9b8":"#4b5563", lineHeight:1.6 }}>{result.color_harmony}</p>
            </div>
          )}
          {result.watch_wardrobe_synergy && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#3b82f6", marginBottom:4 }}>WATCH-WARDROBE SYNERGY</div>
              <p style={{ margin:0, fontSize:13, color:isDark?"#a1a9b8":"#4b5563", lineHeight:1.6 }}>{result.watch_wardrobe_synergy}</p>
            </div>
          )}

          <Section title="Gaps to Fill" items={result.gaps}     color="#f97316" isDark={isDark} />
          <Section title="Invest In"   items={result.invest}    color="#22c55e" isDark={isDark} />
          <Section title="Declutter"   items={result.declutter} color="#ef4444" isDark={isDark} />

          {result.style_identity && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:700, color:sub, textTransform:"uppercase", marginBottom:3 }}>Style Identity</div>
              <p style={{ margin:0, fontSize:13, color:isDark?"#a1a9b8":"#4b5563", fontStyle:"italic" }}>{result.style_identity}</p>
            </div>
          )}
          {result.pro_tip && (
            <div style={{
              padding:"10px 12px", borderRadius:9, background:isDark?"#0f131a":"#f0fdf4",
              borderLeft:"3px solid #22c55e", fontSize:13, color:isDark?"#86efac":"#15803d", lineHeight:1.6,
            }}>
              💡 {result.pro_tip}
            </div>
          )}

          <button onClick={() => setExpanded(false)} style={{
            marginTop:14, background:"none", border:"none", color:sub, fontSize:12, cursor:"pointer", padding:0,
          }}>Hide results ▲</button>
        </div>
      )}

      {result && !expanded && (
        <button onClick={() => setExpanded(true)} style={{
          background:"none", border:"none", color:"#8b5cf6", fontSize:13, cursor:"pointer", padding:0, fontWeight:600,
        }}>
          View audit results — Grade: {result.grade} ▼
        </button>
      )}
    </div>
  );
}

// ── Photo Verifier Section ────────────────────────────────────────────────────
async function verifyPhoto(garment, allGarments) {
  const body = {
    garmentId: garment.id,
    currentType: garment.type ?? garment.category,
    currentColor: garment.color,
    currentName: garment.name,
    hash: garment.hash ?? null,
    // Send ALL other garments as neighbors — not just hash-matched ones.
    // Claude Vision needs to see name/type/color to detect visual duplicates
    // even when hash metadata is missing.
    neighbors: allGarments
      .filter(g => g.id !== garment.id)
      .map(g => ({ id: g.id, name: g.name, type: g.type ?? g.category, color: g.color, hash: g.hash ?? null }))
      .slice(0, 20),
  };
  const photo = garment.thumbnail || garment.photoUrl;
  if (!photo) return null;
  // Route correctly: Storage URLs go as imageUrl, data URIs go as imageBase64
  if (photo.startsWith("data:")) body.imageBase64 = photo;
  else body.imageUrl = photo;

  const res = await fetch("/.netlify/functions/verify-garment-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return await res.json();
}

export function PhotoVerifierPanel() {
  const garments      = useWardrobeStore(s => s.garments);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches       = useWatchStore(s => s.watches);
  const history       = useHistoryStore(s => s.entries);
  const { mode }      = useThemeStore();
  const isDark        = mode === "dark";

  const [results,   setResults]   = useState({}); // { [id]: verifyResult }
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [bgPending, setBgPending] = useState(0);
  // Lightbox
  const [lightbox, setLightbox]   = useState(null); // { src, garmentId }
  // Per-card edit overrides: { [garmentId]: { type, color, name } }
  const [overrides, setOverrides] = useState({});
  // Which cards are in edit mode
  const [editing, setEditing]     = useState({});

  // Restore cached verification results from IDB on mount
  useEffect(() => {
    getCachedState().then(cached => {
      if (cached._verifyResults && Object.keys(cached._verifyResults).length > 0) {
        setResults(cached._verifyResults);
        setDone(true);
      }
    });
    const off = subscribeQueue(state => {
      if (state.type === "verify-photo") setBgPending(state.pending);
    });
    getPendingTasks("verify-photo").then(tasks => {
      if (tasks.length > 0) setBgPending(tasks.length);
    });
    return off;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bg     = isDark ? "#13161f" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#6b7280" : "#9ca3af";
  const card   = isDark ? "#0f131a" : "#f9fafb";
  const inputBg = isDark ? "#1a1f2b" : "#ffffff";

  const withPhoto = garments.filter(g =>
    g.type !== "outfit-photo" && !g.excludeFromWardrobe && (g.thumbnail || g.photoUrl)
  );

  async function runVerification() {
    setRunning(true); setDone(false); setResults({}); setProgress(0); setOverrides({});
    const out = {};
    for (let i = 0; i < withPhoto.length; i++) {
      const g = withPhoto[i];
      try {
        const r = await verifyPhoto(g, withPhoto);
        if (r) out[g.id] = { ...r, garmentId: g.id };
      } catch { /* skip */ }
      setProgress(Math.round(((i + 1) / withPhoto.length) * 100));
    }
    setResults(out);
    setRunning(false);
    setDone(true);
    setCachedState({ _verifyResults: out }).catch(() => {});
  }

  // Resolve what to apply for a garment: user override > AI suggestion > current value
  function resolvedFix(garmentId, r) {
    const g = garments.find(x => x.id === garmentId);
    const ov = overrides[garmentId] ?? {};
    return {
      type:  ov.type  ?? r.correctedType  ?? (g?.type  ?? g?.category),
      color: ov.color ?? r.correctedColor ?? g?.color,
      name:  ov.name  ?? r.correctedName  ?? g?.name,
    };
  }

  function applyFix(garmentId, r) {
    const g = garments.find(x => x.id === garmentId);
    if (!g) return;
    const fix = resolvedFix(garmentId, r);
    const patch = {};
    if (fix.type  && fix.type  !== (g.type  ?? g.category)) patch.type  = fix.type;
    if (fix.color && fix.color !== g.color)                  patch.color = fix.color;
    if (fix.name  && fix.name  !== g.name)                   patch.name  = fix.name;
    if (Object.keys(patch).length) {
      updateGarment(garmentId, patch);
      const updated = { ...g, ...patch, needsReview: false };
      pushGarment(updated).catch(e => console.warn("[AuditPanel] pushGarment failed:", e.message));
      const updatedGarments = garments.map(x => x.id === garmentId ? updated : x);
      setCachedState({ watches, garments: updatedGarments, history }).catch(() => {});
    }
    setResults(r2 => ({ ...r2, [garmentId]: { ...r2[garmentId], _applied: true } }));
    setEditing(e => ({ ...e, [garmentId]: false }));
  }

  function dismissCard(garmentId) {
    setResults(r => ({ ...r, [garmentId]: { ...r[garmentId], _dismissed: true } }));
  }

  function deleteGarment(garmentId) {
    useWardrobeStore.getState().removeGarment(garmentId);
    deleteGarmentCloud(garmentId).catch(() => {});
    // Update IDB cache
    const remaining = garments.filter(g => g.id !== garmentId);
    setCachedState({ watches, garments: remaining, history }).catch(() => {});
    setResults(r => { const n = { ...r }; delete n[garmentId]; return n; });
  }

  function updateOverride(garmentId, key, val) {
    setOverrides(ov => ({ ...ov, [garmentId]: { ...(ov[garmentId] ?? {}), [key]: val } }));
  }

  const issues = Object.values(results).filter(r => !r.ok && !r._applied && !r._dismissed);
  const angles = Object.values(results).filter(r => r.isAngleShot && !r._dismissed && !r._applied);
  const dupes  = Object.values(results).filter(r => r.isDuplicate && !r._dismissed && !r._applied);
  const oks    = Object.values(results).filter(r => r.ok && !r._dismissed);

  const TYPE_OPTIONS  = ["shirt","pants","shoes","jacket","sweater","shorts","dress","skirt","coat","accessory","bag","other"];
  const COLOR_OPTIONS = ["beige","black","blue","brown","burgundy","camel","charcoal","cognac","coral","cream","dark brown","dark green","dark navy","denim","gold","green","grey","ivory","khaki","lavender","light blue","maroon","mint","multicolor","navy","olive","orange","pink","purple","red","rust","sage","sand","silver","slate","tan","taupe","teal","white","wine","yellow"];

  return (
    <div style={{ background: bg, borderRadius: 16, border: `1px solid ${border}`, padding: 18, marginTop: 16 }}>
      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999,
                   display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: "relative", maxWidth: 480, width: "100%" }}>
            <img src={lightbox.src} alt="garment"
              style={{ width: "100%", borderRadius: 14, maxHeight: "80vh", objectFit: "contain" }} />
            <button onClick={() => setLightbox(null)}
              style={{ position: "absolute", top: -12, right: -12, background: "#ef4444", color: "#fff",
                       border: "none", borderRadius: "50%", width: 30, height: 30,
                       fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: text }}>📸 AI Photo Verifier</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>
            {withPhoto.length} garments — tap photo to zoom, edit AI suggestions before applying
            {bgPending > 0 && <span style={{ color: "#f59e0b", marginLeft: 6 }}>{bgPending} uploads queued</span>}
          </div>
        </div>
        <button
          onClick={runVerification}
          disabled={running || withPhoto.length === 0}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none",
                   background: running ? "#374151" : "#8b5cf6", color: "#fff",
                   fontSize: 13, fontWeight: 700, cursor: running ? "wait" : "pointer" }}>
          {running ? `Checking… ${progress}%` : done ? "Re-verify" : "Verify Photos"}
        </button>
      </div>

      {running && (
        <div style={{ height: 4, borderRadius: 2, background: isDark ? "#1a1f2b" : "#e5e7eb", overflow: "hidden", marginBottom: 12 }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "#8b5cf6", transition: "width 0.3s" }} />
        </div>
      )}

      {/* Apply All */}
      {done && issues.length > 1 && (
        <button
          onClick={() => issues.forEach(r => applyFix(r.garmentId, r))}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none",
                   background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 700,
                   cursor: "pointer", marginBottom: 10, width: "100%" }}>
          Apply All {issues.length} Fixes
        </button>
      )}

      {done && issues.length === 0 && !dupes.length && !angles.length && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: isDark ? "#0a1a0a" : "#f0fdf4",
                      border: `1px solid ${isDark ? "#166534" : "#bbf7d0"}`, fontSize: 13,
                      color: isDark ? "#86efac" : "#15803d" }}>
          ✅ All {oks.length} photos verified — labels look correct.
        </div>
      )}

      {/* Mislabel issues */}
      {issues.map(r => {
        const g = garments.find(x => x.id === r.garmentId);
        if (!g) return null;
        const thumb = g.thumbnail || g.photoUrl;
        const isEdit = editing[r.garmentId];
        const ov = overrides[r.garmentId] ?? {};
        const fix = resolvedFix(r.garmentId, r);
        return (
          <div key={r.garmentId} style={{ marginBottom: 10, padding: 12, borderRadius: 12,
                                          background: card, border: `1px solid #f97316` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* Tappable thumbnail */}
              {thumb && (
                <div onClick={() => setLightbox({ src: thumb, garmentId: r.garmentId })}
                  style={{ cursor: "zoom-in", flexShrink: 0, borderRadius: 8, overflow: "hidden",
                           width: 60, height: 60, border: "2px solid #f97316" }}>
                  <img src={thumb} alt={g.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 3 }}>
                  Possible mislabel — {Math.round((r.confidence ?? 0.8) * 100)}% confident
                </div>
                <div style={{ fontSize: 12, color: text, marginBottom: 6 }}>{r.reason}</div>

                {/* AI suggestions (read-only view) */}
                {!isEdit && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, fontSize: 11, marginBottom: 8 }}>
                    {fix.type  !== (g.type ?? g.category) && (
                      <span style={{ padding: "2px 8px", borderRadius: 5, background: "#f9731622", color: "#f97316" }}>
                        type: <b>{g.type ?? g.category}</b> → <b>{fix.type}</b>
                        {ov.type && <span style={{ marginLeft: 3, color: "#fbbf24" }}>✎ edited</span>}
                      </span>
                    )}
                    {fix.color !== g.color && (
                      <span style={{ padding: "2px 8px", borderRadius: 5, background: "#3b82f622", color: "#3b82f6" }}>
                        color: <b>{g.color}</b> → <b>{fix.color}</b>
                        {ov.color && <span style={{ marginLeft: 3, color: "#fbbf24" }}>✎ edited</span>}
                      </span>
                    )}
                    {fix.name !== g.name && (
                      <span style={{ padding: "2px 8px", borderRadius: 5, background: "#8b5cf622", color: "#a78bfa" }}>
                        name → <b>{fix.name}</b>
                        {ov.name && <span style={{ marginLeft: 3, color: "#fbbf24" }}>✎ edited</span>}
                      </span>
                    )}
                  </div>
                )}

                {/* Edit form */}
                {isEdit && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: sub, marginBottom: 2 }}>TYPE</div>
                        <select value={ov.type ?? r.correctedType ?? (g.type ?? g.category)}
                          onChange={e => updateOverride(r.garmentId, "type", e.target.value)}
                          style={{ width: "100%", padding: "5px 7px", borderRadius: 7, border: `1px solid ${border}`,
                                   background: inputBg, color: text, fontSize: 12 }}>
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: sub, marginBottom: 2 }}>COLOR</div>
                        <select value={ov.color ?? r.correctedColor ?? g.color}
                          onChange={e => updateOverride(r.garmentId, "color", e.target.value)}
                          style={{ width: "100%", padding: "5px 7px", borderRadius: 7, border: `1px solid ${border}`,
                                   background: inputBg, color: text, fontSize: 12 }}>
                          {COLOR_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: sub, marginBottom: 2 }}>NAME</div>
                      <input value={ov.name ?? r.correctedName ?? g.name}
                        onChange={e => updateOverride(r.garmentId, "name", e.target.value)}
                        style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: `1px solid ${border}`,
                                 background: inputBg, color: text, fontSize: 12, boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                <button onClick={() => applyFix(r.garmentId, r)}
                  style={{ padding: "6px 11px", borderRadius: 8, border: "none", background: "#22c55e",
                           color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✓ Apply
                </button>
                <button onClick={() => setEditing(e => ({ ...e, [r.garmentId]: !e[r.garmentId] }))}
                  style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${border}`,
                           background: isEdit ? "#f59e0b" : "transparent",
                           color: isEdit ? "#fff" : sub, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {isEdit ? "✎ Done" : "✎ Edit"}
                </button>
                <button onClick={() => dismissCard(r.garmentId)}
                  style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${border}`,
                           background: "transparent", color: sub, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                  ✕ Skip
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Angle shots */}
      {done && angles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 8, textTransform: "uppercase" }}>
            Angle Shots ({angles.length})
          </div>
          {angles.map(r => {
            const g      = garments.find(x => x.id === r.garmentId);
            const parent = garments.find(x => x.id === r.angleOfId);
            if (!g) return null;
            const thumb       = g.thumbnail || g.photoUrl;
            const parentThumb = parent?.thumbnail || parent?.photoUrl;
            return (
              <div key={r.garmentId} style={{ marginBottom: 8, padding: 10, borderRadius: 10,
                                              background: card, border: `1px solid #3b82f6` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {thumb && (
                    <div onClick={() => setLightbox({ src: thumb, garmentId: r.garmentId })}
                      style={{ cursor: "zoom-in", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <img src={thumb} alt={g.name} style={{ width: 48, height: 48, objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 700 }}>→</div>
                  {parentThumb && (
                    <div onClick={() => setLightbox({ src: parentThumb })}
                      style={{ cursor: "zoom-in", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <img src={parentThumb} alt={parent?.name} style={{ width: 48, height: 48, objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: text }}>
                      "{g.name}" is another angle of "{parent?.name ?? r.angleOfId}"
                    </div>
                    <div style={{ fontSize: 11, color: sub }}>{r.reason}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => deleteGarment(r.garmentId)}
                      style={{ padding: "5px 9px", borderRadius: 7, border: "none", background: "#ef4444",
                               color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      🗑 Delete
                    </button>
                    <button onClick={() => dismissCard(r.garmentId)}
                      style={{ padding: "5px 9px", borderRadius: 7, border: `1px solid ${border}`,
                               background: "transparent", color: sub, fontSize: 11, cursor: "pointer" }}>
                      Keep Both
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Duplicates */}
      {done && dupes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 8, textTransform: "uppercase" }}>
            Duplicates ({dupes.length})
          </div>
          {dupes.map(r => {
            const g        = garments.find(x => x.id === r.garmentId);
            const original = garments.find(x => x.id === r.duplicateOfId);
            if (!g) return null;
            const thumb    = g.thumbnail || g.photoUrl;
            const origThumb = original?.thumbnail || original?.photoUrl;
            return (
              <div key={r.garmentId} style={{ marginBottom: 8, padding: 10, borderRadius: 10,
                                              background: card, border: `1px solid #ef4444` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {thumb && (
                    <div onClick={() => setLightbox({ src: thumb, garmentId: r.garmentId })}
                      style={{ cursor: "zoom-in", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <img src={thumb} alt={g.name} style={{ width: 48, height: 48, objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>≡</div>
                  {origThumb && (
                    <div onClick={() => setLightbox({ src: origThumb })}
                      style={{ cursor: "zoom-in", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <img src={origThumb} alt={original?.name} style={{ width: 48, height: 48, objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
                      Duplicate of "{original?.name ?? r.duplicateOfId}"
                    </div>
                    <div style={{ fontSize: 11, color: sub }}>{r.reason}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => deleteGarment(r.garmentId)}
                      style={{ padding: "5px 9px", borderRadius: 7, border: "none", background: "#ef4444",
                               color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      🗑 Delete
                    </button>
                    <button onClick={() => dismissCard(r.garmentId)}
                      style={{ padding: "5px 9px", borderRadius: 7, border: `1px solid ${border}`,
                               background: "transparent", color: sub, fontSize: 11, cursor: "pointer" }}>
                      Keep Both
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
