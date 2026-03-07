/**
 * OccasionPlanner — type an occasion, get 2 outfit recommendations
 * from your actual wardrobe + watches with Claude AI.
 */
import React, { useState, useCallback } from "react";
import { useWatchStore }    from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useThemeStore }    from "../stores/themeStore.js";

const API = "/.netlify/functions/occasion-planner";

const PRESETS = [
  "Business dinner", "Date night", "Beach wedding",
  "Hospital rounds", "Shabbat dinner", "Casual Shabbat",
  "Airport travel", "Summer Riviera",
];

export default function OccasionPlanner() {
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";
  const watches  = useWatchStore(s => s.watches);
  const garments = useWardrobeStore(s => s.garments);

  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";

  const run = useCallback(async (occasion) => {
    const occ = (occasion ?? input).trim();
    if (!occ) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: occ, garments, watches }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }, [input, garments, watches]);

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Occasion Planner</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        Describe an occasion — Claude builds 2 outfits from your actual wardrobe.
      </div>

      {/* Input */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !loading) run(); }}
          placeholder="e.g. Business dinner, Beach wedding, Date night…"
          style={{ width: "100%", background: "transparent", border: "none", outline: "none",
                   color: text, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {PRESETS.map(p => (
            <button key={p} onClick={() => { setInput(p); run(p); }}
              style={{ padding: "4px 10px", borderRadius: 14, border: `1px solid ${border}`,
                       background: "transparent", color: muted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {p}
            </button>
          ))}
        </div>
        <button onClick={() => run()} disabled={!input.trim() || loading}
          style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                   background: input.trim() ? "#3b82f6" : "#374151", color: "#fff",
                   fontSize: 14, fontWeight: 700, cursor: input.trim() ? "pointer" : "not-allowed" }}>
          {loading ? "Planning…" : "Plan Outfit"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 10,
                      padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
          <div>Building your outfits…</div>
        </div>
      )}

      {result && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tips */}
          {result.occasion_tips && (
            <div style={{ background: card, borderRadius: 14, border: `1px solid #2563eb44`, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 8 }}>💡 Occasion Tips</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.6 }}>{result.occasion_tips}</div>
            </div>
          )}

          {/* Outfits */}
          {(result.outfits ?? []).map((outfit, i) => (
            <div key={i} style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: text }}>{outfit.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900,
                              color: outfit.confidence >= 8 ? "#10b981" : outfit.confidence >= 6 ? "#f59e0b" : "#9ca3af" }}>
                  {outfit.confidence}/10
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { icon: "👔", label: "Top",     value: outfit.top },
                  { icon: "👖", label: "Bottom",  value: outfit.bottom },
                  { icon: "👟", label: "Shoes",   value: outfit.shoes },
                  { icon: "⌚", label: "Watch",   value: outfit.watch },
                  ...(outfit.layers ? [{ icon: "🧥", label: "Layers", value: outfit.layers }] : []),
                  ...(outfit.strap  ? [{ icon: "🔗", label: "Strap",  value: outfit.strap  }] : []),
                ].map(({ icon, label, value }) => value ? (
                  <div key={label} style={{ background: isDark ? "#0f131a" : "#f3f4f6", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: "uppercase",
                                  letterSpacing: "0.06em", marginBottom: 3 }}>{icon} {label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: text, lineHeight: 1.3 }}>{value}</div>
                  </div>
                ) : null)}
              </div>
              {outfit.why && (
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.6, fontStyle: "italic",
                              borderTop: `1px solid ${border}`, paddingTop: 10 }}>
                  {outfit.why}
                </div>
              )}
            </div>
          ))}

          {/* Avoid + power move */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {result.avoid && (
              <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", textTransform: "uppercase",
                              letterSpacing: "0.08em", marginBottom: 6 }}>⚠ Avoid</div>
                <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>{result.avoid}</div>
              </div>
            )}
            {result.power_move && (
              <div style={{ background: "linear-gradient(135deg,#1e1b4b,#1e3a5f)", border: "1px solid #4f46e544",
                            borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase",
                              letterSpacing: "0.08em", marginBottom: 6 }}>⚡ Power Move</div>
                <div style={{ fontSize: 12, color: "#c4b5fd", lineHeight: 1.5 }}>{result.power_move}</div>
              </div>
            )}
          </div>

          <button onClick={() => { setResult(null); setInput(""); }}
            style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: `1px solid ${border}`,
                     background: "transparent", color: text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Plan Another Occasion
          </button>
        </div>
      )}
    </div>
  );
}
