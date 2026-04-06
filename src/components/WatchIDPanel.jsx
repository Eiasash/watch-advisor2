/**
 * WatchIDPanel — AI Watch Identification from photo
 * Camera/gallery → Claude Vision identifies brand, model, dial, lug width, complications etc.
 */
import React, { useState } from "react";
import { useThemeStore } from "../stores/themeStore.js";
import { useWatchStore } from "../stores/watchStore.js";

function resizeImage(file, maxPx = 1200) {
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
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const DIAL_SWATCH = {
  "silver-white":"#e8e8e0","green":"#3d6b45","grey":"#8a8a8a","blue":"#2d5fa0",
  "navy":"#1e2f5e","white":"#f0ede8","black":"#1a1a1a","teal":"#2a8a82",
  "burgundy":"#6b1a2a","purple":"#5a2a7a","turquoise":"#1a9b8a","red":"#9b1a1a",
  "meteorite":"#c0c0c0",
};

export default function WatchIDPanel({ onIdentified }) {
  const { mode } = useThemeStore();
  const isDark   = mode === "dark";
  const watches  = useWatchStore(s => s.watches) ?? [];
  const [image,   setImage]   = useState(null);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [open,    setOpen]    = useState(false);

  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const bg     = isDark ? "#0f131a" : "#f3f4f6";

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    const dataUrl = await resizeImage(file);
    setImage(dataUrl);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/watch-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          collection: watches.map(w => ({
            brand: w.brand,
            model: w.model,
            ref:   w.ref ?? w.reference ?? null,
            dial:  w.dial ?? w.dialColor ?? null,
          })),
        }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("json")) {
        throw new Error(res.status === 502 || res.status === 504
          ? `Function timed out (${res.status}). Try again.`
          : `Server error ${res.status}`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch(e) {
      setError(e.message ?? "Identification failed");
    } finally {
      setLoading(false);
    }
  }

  const dialColor = result?.dial_color?.toLowerCase() ?? "";
  const swatch    = DIAL_SWATCH[dialColor] ?? (result?.dial_hex ?? "#444");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${border}`,
                 background: "transparent", color: muted, fontSize: 12, fontWeight: 700,
                 cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        🔍 AI Watch ID
      </button>
    );
  }

  return (
    <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 18, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: text }}>🔍 Watch ID</div>
          <div style={{ fontSize: 12, color: muted }}>Point at any watch — Claude identifies it</div>
        </div>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>

      {/* Upload buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[
          { label: "📷 Camera", capture: "environment" },
          { label: "📁 Gallery", capture: null },
        ].map(({ label, capture }) => (
          <label key={label} style={{ flex: 1, padding: "10px 0", borderRadius: 10,
              border: `1px dashed ${border}`, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: muted, fontSize: 12, fontWeight: 600 }}>
            {label}
            <input type="file" accept="image/*" style={{ display: "none" }}
              {...(capture ? { capture } : {})}
              onChange={e => { if(e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value=""; }} />
          </label>
        ))}
      </div>

      {/* Preview */}
      {image && (
        <div style={{ position: "relative", marginBottom: 14, borderRadius: 10, overflow: "hidden" }}>
          <img src={image} alt="watch" style={{ width: "100%", maxHeight: 250, objectFit: "cover" }} />
          {loading && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)",
                          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
              <div style={{ width: 32, height: 32, border: "3px solid #3b82f6",
                            borderTopColor: "transparent", borderRadius: "50%",
                            animation: "spin 0.8s linear infinite" }} />
              <div style={{ color: "#fff", fontSize: 12 }}>Identifying…</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: "#ef444422",
                      border: "1px solid #ef444444", color: "#ef4444", fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div>
          {/* Brand/model hero */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14,
                        padding: "14px 16px", borderRadius: 12, background: bg, border: `1px solid ${border}` }}>
            <div style={{ width: 50, height: 50, borderRadius: "50%", background: swatch,
                          border: `3px solid ${isDark ? "#2b3140" : "#d1d5db"}`, flexShrink: 0,
                          boxShadow: "inset 0 0 0 2px #00000022" }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: text }}>
                {result.emoji ?? "⌚"} {result.brand} {result.model}
              </div>
              {result.reference && <div style={{ fontSize: 12, color: muted }}>Ref: {result.reference}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {result.case_size && <span style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6",
                  background: "#3b82f622", borderRadius: 20, padding: "1px 7px" }}>{result.case_size}mm</span>}
                {result.movement_type && <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981",
                  background: "#10b98122", borderRadius: 20, padding: "1px 7px" }}>{result.movement_type}</span>}
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b",
                  background: "#f59e0b22", borderRadius: 20, padding: "1px 7px" }}>
                  {result.confidence ?? "?"}/10 conf
                </span>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Dial", val: result.dial_color },
              { label: "Case", val: result.case_material },
              { label: "Lug width", val: result.lug_width ? result.lug_width + "mm" : null },
              { label: "Strap", val: [result.strap_type, result.strap_color].filter(Boolean).join(" · ") || null },
              { label: "Style", val: result.style_category },
              { label: "Temperature", val: result.temperature },
            ].filter(x => x.val).map(({ label, val }) => (
              <div key={label} style={{ padding: "8px 10px", borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 10, color: muted, marginBottom: 2 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Complications */}
          {result.complications?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginBottom: 6 }}>COMPLICATIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {result.complications.map(c => (
                  <span key={c} style={{ fontSize: 10, fontWeight: 700, color: "#8b5cf6",
                    background: "#8b5cf622", borderRadius: 20, padding: "2px 8px" }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Suggested contexts */}
          {result.suggested_contexts?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginBottom: 6 }}>BEST FOR</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {result.suggested_contexts.map(c => (
                  <span key={c} style={{ fontSize: 10, fontWeight: 700, color: "#10b981",
                    background: "#10b98122", borderRadius: 20, padding: "2px 8px" }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {result.notes && (
            <div style={{ fontSize: 11, color: muted, fontStyle: "italic", lineHeight: 1.5 }}>{result.notes}</div>
          )}

          {onIdentified && (
            <button onClick={() => { onIdentified(result); setOpen(false); }}
              style={{ marginTop: 12, width: "100%", padding: "10px 0", borderRadius: 10,
                       border: "none", background: "#3b82f6", color: "#fff",
                       fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Add to Collection →
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
