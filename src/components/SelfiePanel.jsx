/**
 * SelfiePanel — AI Selfie / Outfit Photo Checker
 * Upload or take a photo → Claude Vision analyzes the full look.
 * Shows impact score, color story, strap-shoe check, upgrade suggestion.
 * Stores history of last 20 checks in localStorage via styleLearningStore.
 */
import React, { useState, useRef, useCallback } from "react";
import { useWatchStore }    from "../stores/watchStore.js";
import { useThemeStore }    from "../stores/themeStore.js";

const API = "/.netlify/functions/selfie-check";

function resizeImage(file, maxPx = 800) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        c.width  = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const SCORE_COLOR = s => s >= 8 ? "#10b981" : s >= 6 ? "#f59e0b" : "#ef4444";

export default function SelfiePanel({ context = "smart-casual" }) {
  const { mode }  = useThemeStore();
  const isDark    = mode === "dark";
  const watches   = useWatchStore(s => s.watches);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [result,   setResult]   = useState(null);
  const [history,  setHistory]  = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("selfie_history") ?? "[]"); }
    catch { return []; }
  });

  const cameraRef   = useRef();
  const frontRef    = useRef();
  const galleryRef  = useRef();

  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const bg2    = isDark ? "#0f131a" : "#f3f4f6";

  const check = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const dataUrl = await resizeImage(file);
    setPreview(dataUrl);
    setLoading(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, watches, context }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      const entry = { id: Date.now(), ts: new Date().toISOString(), preview: dataUrl, result: data };
      setHistory(prev => {
        const next = [entry, ...prev].slice(0, 20);
        try { sessionStorage.setItem("selfie_history", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (e) {
      setError(e.message ?? "AI check failed");
    } finally {
      setLoading(false);
    }
  }, [watches, context]);

  const handleFile = useCallback(e => {
    const f = e.target.files?.[0];
    if (f) check(f);
    e.target.value = "";
  }, [check]);

  const clear = () => { setPreview(null); setResult(null); setError(null); };

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Outfit Check</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        AI analyzes your full look — garments, watch, strap-shoe rule, color harmony.
      </div>

      {/* Upload area */}
      {!preview && (
        <div style={{ background: card, borderRadius: 16, border: `1px dashed ${border}`, padding: 24, marginBottom: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 16, fontSize: 40 }}>🪞</div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              📷 Camera
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                     style={{ display: "none" }} onChange={handleFile} />
            </label>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              🤳 Selfie
              <input ref={frontRef} type="file" accept="image/*" capture="user"
                     style={{ display: "none" }} onChange={handleFile} />
            </label>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              📁 Gallery
              <input ref={galleryRef} type="file" accept="image/*"
                     style={{ display: "none" }} onChange={handleFile} />
            </label>
          </div>
        </div>
      )}

      {/* Preview + loading */}
      {preview && (
        <div style={{ position: "relative", marginBottom: 16 }}>
          <img src={preview} alt="outfit"
               style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 16, display: "block" }} />
          {!loading && (
            <button onClick={clear}
              style={{ position: "absolute", top: 8, right: 8, background: "#ef4444", color: "#fff",
                       border: "none", borderRadius: "50%", width: 28, height: 28, fontSize: 14,
                       cursor: "pointer", fontWeight: 700 }}>×</button>
          )}
          {loading && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", borderRadius: 16,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)",
                            borderTopColor: "#fff", borderRadius: "50%",
                            animation: "spin 0.8s linear infinite" }} />
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Analyzing outfit…</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 10,
                      padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Impact score */}
          <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: SCORE_COLOR(result.impact), lineHeight: 1 }}>
                {result.impact}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                              letterSpacing: "0.08em" }}>Impact Score</div>
                <div style={{ fontSize: 13, color: text, marginTop: 2, lineHeight: 1.4 }}>{result.impact_why}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.6, fontStyle: "italic" }}>{result.vision}</div>
          </div>

          {/* Color story */}
          {result.color_story && (
            <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 8 }}>🎨 Color Story</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.6 }}>{result.color_story}</div>
            </div>
          )}

          {/* Works / Risk */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {result.works && (
              <div style={{ background: "#052e16", border: "1px solid #14532d", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", textTransform: "uppercase",
                              letterSpacing: "0.08em", marginBottom: 6 }}>✓ Works</div>
                <div style={{ fontSize: 12, color: "#bbf7d0", lineHeight: 1.5 }}>{result.works}</div>
              </div>
            )}
            {result.risk && (
              <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", textTransform: "uppercase",
                              letterSpacing: "0.08em", marginBottom: 6 }}>⚠ Risk</div>
                <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>{result.risk}</div>
              </div>
            )}
          </div>

          {/* Proportion + fit */}
          {result.proportion_note && (
            <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 8 }}>📐 Proportion & Fit</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.5 }}>{result.proportion_note}</div>
              {result.fit_assessment && (
                <div style={{ marginTop: 6, fontSize: 12, color: muted, fontStyle: "italic" }}>{result.fit_assessment}</div>
              )}
            </div>
          )}

          {/* Watch detection */}
          {result.watch_details && (
            <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase",
                              letterSpacing: "0.08em" }}>⌚ Watch Detected</div>
                <div style={{ fontSize: 11, fontWeight: 700,
                              color: result.watch_confidence >= 7 ? "#10b981" : "#f59e0b" }}>
                  {result.watch_confidence}/10
                </div>
              </div>
              <div style={{ fontSize: 13, color: text }}>{result.watch_details}</div>
              {result.strap_call && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#60a5fa", lineHeight: 1.5 }}>
                  🔗 {result.strap_call}
                </div>
              )}
              {result.better_watch && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#a78bfa" }}>
                  💡 Alt: {result.better_watch}
                </div>
              )}
            </div>
          )}

          {/* Upgrade */}
          {result.upgrade && (
            <div style={{ background: "linear-gradient(135deg,#1e3a5f,#1a1f2b)", borderRadius: 14,
                          border: "1px solid #2563eb44", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 8 }}>⚡ Upgrade</div>
              <div style={{ fontSize: 13, color: "#bfdbfe", lineHeight: 1.6 }}>{result.upgrade}</div>
            </div>
          )}

          {/* New photo button */}
          <button onClick={clear}
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: `1px solid ${border}`,
                     background: "transparent", color: text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Check Another Outfit
          </button>
        </div>
      )}

      {/* History */}
      {!result && history.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", marginBottom: 10, marginTop: 4 }}>Recent Checks</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {history.slice(0, 6).map(h => (
              <div key={h.id} style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden",
                                        border: `1px solid ${border}`, position: "relative" }}
                   onClick={() => { setPreview(h.preview); setResult(h.result); }}>
                <img src={h.preview} alt="past"
                     style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                              background: "linear-gradient(transparent,rgba(0,0,0,0.8))",
                              padding: "8px 6px 4px", display: "flex", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: SCORE_COLOR(h.result?.impact ?? 0) }}>
                    {h.result?.impact ?? "?"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
