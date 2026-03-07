/**
 * SelfiePanel — outfit photo AI analysis (aiSelfieCheck equivalent)
 * Drop a photo or use camera → Claude Vision returns full analysis:
 * impact score, color story, proportion, fit, works/risk, upgrade, watch details.
 */
import React, { useState, useCallback, useRef } from "react";
import { useWatchStore }   from "../stores/watchStore.js";
import { useThemeStore }   from "../stores/themeStore.js";

function resizeImage(file, maxPx = 800) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
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

const IMPACT_COLOR = n => n >= 8 ? "#10b981" : n >= 6 ? "#f59e0b" : "#ef4444";

export default function SelfiePanel({ context = "smart-casual" }) {
  const { mode }    = useThemeStore();
  const isDark      = mode === "dark";
  const watches     = useWatchStore(s => s.watches);

  const [image,    setImage]    = useState(null); // data URL
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [history,  setHistory]  = useState([]);
  const [showHist, setShowHist] = useState(false);
  const cameraRef  = useRef(null);
  const selfieRef  = useRef(null);
  const galleryRef = useRef(null);

  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const bg     = isDark ? "#0f131a" : "#f3f4f6";

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    const dataUrl = await resizeImage(file, 1024);
    setImage(dataUrl);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/selfie-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, watches, context }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      setHistory(prev => [{ image: dataUrl, result: data, ts: Date.now() }, ...prev].slice(0, 10));
    } catch (e) {
      setError(e.message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [watches, context]);

  const onFileChange = e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; };

  const scoreColor = result ? IMPACT_COLOR(result.impact ?? 0) : "#3b82f6";

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: text }}>📸 Outfit Check</div>
            <div style={{ fontSize: 12, color: muted }}>Claude Vision analyses your look</div>
          </div>
          {history.length > 0 && (
            <button onClick={() => setShowHist(v => !v)}
              style={{ fontSize: 11, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
              {showHist ? "Hide" : `History (${history.length})`}
            </button>
          )}
        </div>

        {/* Camera / gallery buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { ref: selfieRef,  capture: "user",        label: "🤳 Selfie" },
            { ref: cameraRef,  capture: "environment", label: "📷 Camera" },
            { ref: galleryRef, capture: null,           label: "📁 Gallery" },
          ].map(({ ref, capture, label }) => (
            <label key={label} style={{ flex: 1, padding: "10px 0", borderRadius: 10,
                border: `1px dashed ${border}`, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", color: muted, fontSize: 12, fontWeight: 600 }}>
              {label}
              <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
                {...(capture ? { capture } : {})} onChange={onFileChange} />
            </label>
          ))}
        </div>

        {/* Preview */}
        {image && (
          <div style={{ position: "relative", marginBottom: 14, borderRadius: 10, overflow: "hidden" }}>
            <img src={image} alt="outfit" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
            {loading && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexDirection: "column", gap: 12 }}>
                <div style={{ width: 36, height: 36, border: "3px solid #3b82f6",
                              borderTopColor: "transparent", borderRadius: "50%",
                              animation: "spin 0.8s linear infinite" }} />
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Analysing…</div>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ef444422",
                        border: "1px solid #ef444444", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div>
            {/* Impact score */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14,
                          padding: "14px 16px", borderRadius: 12,
                          background: isDark ? "#0f131a" : "#f3f4f6", border: `1px solid ${border}` }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor }}>{result.impact ?? "—"}</div>
                <div style={{ fontSize: 9, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Impact</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.5, marginBottom: 4 }}>{result.impact_why}</div>
                {result.vision && <div style={{ fontSize: 11, color: muted, lineHeight: 1.5, fontStyle: "italic" }}>{result.vision}</div>}
              </div>
            </div>

            {/* Color story + proportion */}
            {[
              { label: "Color Story",  val: result.color_story,      icon: "🎨" },
              { label: "Proportion",   val: result.proportion_note,  icon: "📐" },
              { label: "Fit",          val: result.fit_assessment,   icon: "✂️" },
              { label: "What works",   val: result.works,            icon: "✅" },
              { label: "Risk",         val: result.risk,             icon: "⚠️", skip: !result.risk },
              { label: "Upgrade",      val: result.upgrade,          icon: "⬆️" },
              { label: "Strap call",   val: result.strap_call,       icon: "⌚", skip: !result.strap_call },
              { label: "Better watch", val: result.better_watch,     icon: "🔄", skip: !result.better_watch },
            ].filter(x => !x.skip && x.val).map(({ label, val, icon }) => (
              <div key={label} style={{ marginBottom: 8, padding: "10px 12px", borderRadius: 8,
                                        background: bg, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase",
                              letterSpacing: "0.07em", marginBottom: 3 }}>{icon} {label}</div>
                <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>{val}</div>
              </div>
            ))}

            {/* Watch detection */}
            {result.watch_details && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8,
                            background: isDark ? "#0c1f3f" : "#eff6ff", border: "1px solid #3b82f633" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", marginBottom: 3,
                              textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  ⌚ Watch Detected — {result.watch_confidence ?? "?"}/10 confidence
                </div>
                <div style={{ fontSize: 12, color: text }}>{result.watch_details}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      {showHist && history.length > 0 && (
        <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", marginBottom: 12 }}>Past Checks</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {history.map(({ image: img, result: r, ts }) => (
              <div key={ts} onClick={() => { setImage(img); setResult(r); setShowHist(false); }}
                style={{ flexShrink: 0, cursor: "pointer", borderRadius: 10, overflow: "hidden",
                         border: `1px solid ${border}`, position: "relative", width: 80 }}>
                <img src={img} style={{ width: 80, height: 100, objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", top: 4, right: 4, background: IMPACT_COLOR(r.impact ?? 0),
                              color: "#fff", borderRadius: 20, fontSize: 10, fontWeight: 800,
                              padding: "1px 5px" }}>{r.impact}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
