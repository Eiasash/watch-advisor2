/**
 * StyleDNA — personal style profile extracted from wear history.
 * Fetches from /style-dna endpoint, displays archetype + insights.
 */
import { useState, useEffect } from "react";
import { useThemeStore } from "../../stores/themeStore.js";

export default function StyleDNA() {
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const card = isDark ? "#161b22" : "#faf5ff";
  const border = isDark ? "#581c8730" : "#e9d5ff40";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#8b93a7" : "#6b7280";
  const accent = "#a855f7";

  const fetchDna = async (force = false) => {
    setLoading(true); setError(null);
    try {
      const url = "/.netlify/functions/style-dna";
      const res = force
        ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ forceRefresh: true }) })
        : await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error && !data.analysis) throw new Error(data.error);
      setDna(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDna(); }, []);

  if (loading && !dna) return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase" }}>🧬 Style DNA</div>
      <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>Analyzing your patterns...</div>
    </div>
  );

  if (error && !dna) return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase" }}>🧬 Style DNA</div>
      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{error}</div>
      <button onClick={() => fetchDna(true)} style={{ marginTop: 6, padding: "3px 10px", borderRadius: 6, border: `1px solid ${accent}`, background: "transparent", color: accent, fontSize: 10, cursor: "pointer" }}>Retry</button>
    </div>
  );

  if (!dna?.analysis) return null;
  const a = dna.analysis;

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expanded ? 12 : 0 }}>
        <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            🧬 Style DNA
          </span>
          {a.styleArchetype && (
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: text }}>
              {a.styleArchetype}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); fetchDna(true); }} style={{
            padding: "3px 8px", borderRadius: 6, border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
            background: "transparent", color: muted, fontSize: 10, cursor: "pointer",
          }}>{loading ? "..." : "🔄"}</button>
          <span onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer", color: muted, fontSize: 10 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && (
        <>
          {/* Color palette */}
          {dna.topColors?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 6 }}>Color Gravity</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {dna.topColors.map(([color, count]) => (
                  <div key={color} style={{
                    padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                    background: isDark ? "#1a1040" : "#f5f3ff",
                    border: `1px solid ${accent}22`, color: text,
                  }}>
                    {color} <span style={{ color: muted }}>×{count}</span>
                  </div>
                ))}
              </div>
              {a.colorSignature && (
                <div style={{ fontSize: 11, color: muted, marginTop: 6, lineHeight: 1.4 }}>{a.colorSignature}</div>
              )}
            </div>
          )}

          {/* Top combos */}
          {dna.topCombos?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 4 }}>Favorite Combos</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {dna.topCombos.map(([combo, count]) => (
                  <div key={combo} style={{
                    padding: "3px 8px", borderRadius: 6, fontSize: 10,
                    background: isDark ? "#0f131a" : "#f9fafb",
                    border: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`, color: text,
                  }}>
                    {combo.replace("+", " × ")} <span style={{ color: muted }}>({count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formality center */}
          {dna.avgFormality != null && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 4 }}>Formality Center</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: isDark ? "#1a1f2b" : "#e5e7eb", position: "relative" }}>
                  <div style={{
                    position: "absolute", left: `${(dna.avgFormality / 10) * 100}%`,
                    top: -3, width: 12, height: 12, borderRadius: "50%",
                    background: accent, transform: "translateX(-50%)",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: text }}>{dna.avgFormality}/10</span>
              </div>
              {a.formalityCenter && (
                <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{a.formalityCenter}</div>
              )}
            </div>
          )}

          {/* Strengths & blind spots */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {a.strengths?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", marginBottom: 4 }}>Strengths</div>
                {a.strengths.map((s, i) => (
                  <div key={i} style={{ fontSize: 10, color: text, marginBottom: 2 }}>✓ {s}</div>
                ))}
              </div>
            )}
            {a.blindSpots?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", marginBottom: 4 }}>Blind Spots</div>
                {a.blindSpots.map((s, i) => (
                  <div key={i} style={{ fontSize: 10, color: text, marginBottom: 2 }}>○ {s}</div>
                ))}
              </div>
            )}
          </div>

          {/* Watch affinity */}
          {a.watchStyleAffinity && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 4 }}>Watch-Outfit Affinity</div>
              <div style={{ fontSize: 11, color: text, lineHeight: 1.4 }}>{a.watchStyleAffinity}</div>
            </div>
          )}

          {/* Next purchase rec */}
          {a.nextPurchaseRec && (
            <div style={{
              padding: "8px 10px", borderRadius: 8,
              background: isDark ? "#1a1040" : "#f5f3ff",
              border: `1px solid ${accent}22`,
              fontSize: 11, color: isDark ? "#c4b5fd" : "#7c3aed", lineHeight: 1.4,
              marginBottom: 8,
            }}>
              🛒 <span style={{ fontWeight: 700 }}>Next buy:</span> {a.nextPurchaseRec}
            </div>
          )}

          {/* Stats footer */}
          <div style={{ fontSize: 9, color: muted }}>
            {dna.entriesAnalyzed} outfits analyzed · {dna.totalGarments} garments · {dna.neverWornCount} never worn
            {dna.generatedAt && <span> · {new Date(dna.generatedAt).toLocaleDateString()}</span>}
          </div>
        </>
      )}
    </div>
  );
}
