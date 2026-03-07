import React, { useState } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

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
