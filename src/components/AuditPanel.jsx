import React, { useState, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { pushGarment } from "../services/supabaseSync.js";
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
async function verifyPhoto(garment) {
  const body = {
    garmentId: garment.id,
    currentType: garment.type ?? garment.category,
    currentColor: garment.color,
    currentName: garment.name,
    hash: garment.hash ?? null,
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
  const garments   = useWardrobeStore(s => s.garments);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches    = useWatchStore(s => s.watches);
  const history    = useHistoryStore(s => s.entries);
  const { mode }   = useThemeStore();
  const isDark     = mode === "dark";

  const [results, setResults]   = useState({}); // { [id]: verifyResult }
  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const [progress, setProgress] = useState(0);
  const [bgPending, setBgPending] = useState(0);

  // Restore cached verification results from IDB on mount
  useEffect(() => {
    getCachedState().then(cached => {
      if (cached._verifyResults && Object.keys(cached._verifyResults).length > 0) {
        setResults(cached._verifyResults);
        setDone(true);
      }
    });
    // Subscribe to background queue for verify tasks
    const off = subscribeQueue(state => {
      if (state.type === "verify-photo") setBgPending(state.pending);
    });
    // Check for pending verify tasks from previous session
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

  const withPhoto = garments.filter(g =>
    g.type !== "outfit-photo" && !g.excludeFromWardrobe && (g.thumbnail || g.photoUrl)
  );

  async function runVerification() {
    setRunning(true); setDone(false); setResults({}); setProgress(0);
    const out = {};
    for (let i = 0; i < withPhoto.length; i++) {
      const g = withPhoto[i];
      try {
        const r = await verifyPhoto(g);
        if (r) out[g.id] = r;
      } catch { /* skip */ }
      setProgress(Math.round(((i + 1) / withPhoto.length) * 100));
    }
    setResults(out);
    setRunning(false);
    setDone(true);
    // Persist results to IDB so they survive tab close
    setCachedState({ _verifyResults: out }).catch(() => {});
  }

  function applyFix(garmentId, fix) {
    const g = garments.find(x => x.id === garmentId);
    if (!g) return;
    const patch = {};
    if (fix.correctedType  && fix.correctedType  !== (g.type ?? g.category)) patch.type = fix.correctedType;
    if (fix.correctedColor && fix.correctedColor !== g.color)                 patch.color = fix.correctedColor;
    if (fix.correctedName  && fix.correctedName  !== g.name)                  patch.name = fix.correctedName;
    if (!Object.keys(patch).length) {
      setResults(r => ({ ...r, [garmentId]: { ...r[garmentId], _applied: true } }));
      return;
    }
    // 1. Update Zustand state
    updateGarment(garmentId, patch);
    // 2. Persist to Supabase (fire-and-forget)
    const updated = { ...g, ...patch, needsReview: false };
    pushGarment(updated).catch(e => console.warn("[AuditPanel] pushGarment failed:", e.message));
    // 3. Update local IndexedDB cache so reload doesn't revert
    const updatedGarments = garments.map(x => x.id === garmentId ? updated : x);
    setCachedState({ watches, garments: updatedGarments, history }).catch(() => {});
    // 4. Mark as applied in results UI
    setResults(r => ({ ...r, [garmentId]: { ...r[garmentId], _applied: true } }));
  }

  const issues = Object.values(results).filter(r => !r.ok && !r._applied);
  const oks    = Object.values(results).filter(r => r.ok);

  return (
    <div style={{ background: bg, borderRadius: 16, border: `1px solid ${border}`, padding: 18, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: text }}>📸 AI Photo Verifier</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>
            {withPhoto.length} garments with photos — Claude Vision checks each label
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

      {done && issues.length === 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: isDark ? "#0a1a0a" : "#f0fdf4",
                      border: `1px solid ${isDark ? "#166534" : "#bbf7d0"}`, fontSize: 13,
                      color: isDark ? "#86efac" : "#15803d" }}>
          ✅ All {oks.length} photos verified — labels look correct.
        </div>
      )}

      {issues.map(r => {
        const g = garments.find(x => x.id === r.garmentId);
        if (!g) return null;
        const thumb = g.thumbnail || g.photoUrl;
        const typeChanged  = r.correctedType  !== (g.type ?? g.category);
        const colorChanged = r.correctedColor !== g.color;
        const nameChanged  = r.correctedName  !== g.name;
        return (
          <div key={r.garmentId} style={{ marginBottom: 10, padding: 12, borderRadius: 12,
                                          background: card, border: `1px solid #f97316` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {thumb && (
                <img src={thumb} alt={g.name}
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f97316", marginBottom: 3 }}>
                  ⚠ Possible mislabel — {Math.round((r.confidence ?? 0.8) * 100)}% confident
                </div>
                <div style={{ fontSize: 12, color: text, marginBottom: 4 }}>{r.reason}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
                  {typeChanged && (
                    <span style={{ padding: "2px 8px", borderRadius: 5, background: "#f9731622", color: "#f97316" }}>
                      type: <b>{g.type ?? g.category}</b> → <b>{r.correctedType}</b>
                    </span>
                  )}
                  {colorChanged && (
                    <span style={{ padding: "2px 8px", borderRadius: 5, background: "#3b82f622", color: "#3b82f6" }}>
                      color: <b>{g.color}</b> → <b>{r.correctedColor}</b>
                    </span>
                  )}
                  {nameChanged && (
                    <span style={{ padding: "2px 8px", borderRadius: 5, background: "#8b5cf622", color: "#a78bfa" }}>
                      name: <b>{r.correctedName}</b>
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => applyFix(r.garmentId, r)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#22c55e",
                         color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Apply
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
