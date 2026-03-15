/**
 * OccasionPanel — AI Occasion Planner
 * Type an occasion → Claude generates 2 complete outfits from your actual wardrobe + watches.
 */
import React, { useState, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useThemeStore }    from "../stores/themeStore.js";

function ConfidenceDots({ n, isDark }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%",
          background: i < n ? (n >= 8 ? "#10b981" : n >= 6 ? "#f59e0b" : "#3b82f6")
                             : (isDark ? "#2b3140" : "#e5e7eb") }} />
      ))}
    </div>
  );
}

function OutfitCard({ outfit, isDark }) {
  const card   = isDark ? "#0f131a" : "#f3f4f6";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: text, marginBottom: 8 }}>{outfit.name}</div>
      <ConfidenceDots n={outfit.confidence ?? 7} isDark={isDark} />
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Top",     val: outfit.top,    icon: "👕" },
          { label: "Bottom",  val: outfit.bottom, icon: "👖" },
          { label: "Shoes",   val: outfit.shoes,  icon: "👞" },
          { label: "Watch",   val: outfit.watch,  icon: "⌚" },
        ].map(({ label, val, icon }) => val && (
          <div key={label} style={{ padding: "8px 10px", borderRadius: 8,
                                    background: isDark ? "#171a21" : "#fff",
                                    border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: muted, marginBottom: 2 }}>{icon} {label.toUpperCase()}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: text }}>{val}</div>
          </div>
        ))}
      </div>
      {outfit.layers && (
        <div style={{ marginTop: 8, fontSize: 11, color: muted }}>🧥 Layer: {outfit.layers}</div>
      )}
      {outfit.why && (
        <div style={{ marginTop: 10, fontSize: 12, color: text, lineHeight: 1.6,
                      borderTop: `1px solid ${border}`, paddingTop: 10 }}>{outfit.why}</div>
      )}
    </div>
  );
}

export default function OccasionPanel() {
  const { mode }  = useThemeStore();
  const isDark    = mode === "dark";
  const garments  = useWardrobeStore(s => s.garments);
  const watches   = useWatchStore(s => s.watches);

  const [input,   setInput]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [history, setHistory] = useState([]);

  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";

  const handlePlan = useCallback(async () => {
    if (!input.trim() || loading) return;
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      // Strip all image data before sending — thumbnails/photoAngles are base64
      // and inflate the payload to 4-6MB with 200+ garments, hitting Netlify's limit.
      const leanGarments = garments.map(({ thumbnail, photoAngles, photo, ...rest }) => rest);
      const leanWatches  = watches.map(({ thumbnail, photo, ...rest }) => rest);

      const res = await fetch("/.netlify/functions/occasion-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: input.trim(), garments: leanGarments, watches: leanWatches }),
      });
      if (!res.ok) {
        // Read body for error detail even on non-200
        let errMsg = `Planning failed (${res.status})`;
        try { const ed = await res.json(); if (ed.error) errMsg = ed.error; } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setHistory(prev => [{ occasion: input.trim(), result: data, ts: Date.now() }, ...prev].slice(0, 8));
    } catch (e) {
      setError(e.message ?? "Planning failed");
    } finally {
      setLoading(false);
    }
  }, [input, garments, watches, loading]);

  const suggestions = ["Business dinner", "Beach wedding", "Date night", "Clinic day", "Family event", "Riviera lunch", "Job interview", "Weekend brunch"];

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>✨ Occasion Planner</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        Describe your occasion — Claude builds 2 outfits from your wardrobe
      </div>

      {/* Input */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && input.trim()) { e.preventDefault(); handlePlan(); } }}
          placeholder="e.g. Business dinner in Tel Aviv, Beach wedding, Clinic day with senior staff…"
          style={{ width: "100%", background: "transparent", border: "none", outline: "none",
                   color: text, fontSize: 13, resize: "none", fontFamily: "inherit",
                   boxSizing: "border-box", marginBottom: 12 }} />

        {/* Suggestions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setInput(s)}
              style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${border}`,
                       background: "transparent", color: muted, fontSize: 11, cursor: "pointer",
                       fontWeight: 600 }}>{s}</button>
          ))}
        </div>

        <button onClick={handlePlan} disabled={!input.trim() || loading}
          style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                   background: input.trim() && !loading ? "linear-gradient(135deg,#6366f1,#3b82f6)" : "#374151",
                   color: "#fff", fontSize: 14, fontWeight: 800,
                   cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                   display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, border: "2px solid #ffffff44",
                            borderTopColor: "#fff", borderRadius: "50%",
                            animation: "spin 0.8s linear infinite" }} />
              Planning…
            </>
          ) : "Plan My Outfit →"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ef444422",
                      border: "1px solid #ef444444", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Tips */}
          {result.occasion_tips && (
            <div style={{ background: card, borderRadius: 14,
                          border: "1px solid #6366f133", padding: 16, marginBottom: 14,
                          borderLeft: "4px solid #6366f1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 8 }}>Occasion Advice</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.7 }}>{result.occasion_tips}</div>
            </div>
          )}

          {/* Outfits */}
          {(result.outfits ?? []).map((o, i) => (
            <OutfitCard key={i} outfit={o} isDark={isDark} />
          ))}

          {/* Avoid */}
          {result.avoid && (
            <div style={{ background: card, borderRadius: 14, border: "1px solid #ef444433",
                          padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 6 }}>⚠️ Avoid</div>
              <div style={{ fontSize: 12, color: text, lineHeight: 1.6 }}>{result.avoid}</div>
            </div>
          )}

          {/* Power move */}
          {result.power_move && (
            <div style={{ background: card, borderRadius: 14, border: "1px solid #f59e0b44",
                          padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 6 }}>⚡ Power Move</div>
              <div style={{ fontSize: 12, color: text, lineHeight: 1.6 }}>{result.power_move}</div>
            </div>
          )}
        </>
      )}

      {/* Recent history */}
      {history.length > 1 && (
        <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", marginBottom: 10 }}>Recent Plans</div>
          {history.slice(1).map(({ occasion, result: r, ts }) => (
            <div key={ts} onClick={() => { setInput(occasion); setResult(r); }}
              style={{ padding: "8px 0", borderBottom: `1px solid ${border}`, cursor: "pointer",
                       display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 18 }}>✨</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{occasion}</div>
                <div style={{ fontSize: 11, color: muted }}>{new Date(ts).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
