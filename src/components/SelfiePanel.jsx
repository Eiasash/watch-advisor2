/**
 * SelfiePanel — AI Selfie / Outfit Photo Checker
 * Upload or take a photo → Claude Vision analyzes the full look.
 * Shows impact score, color story, strap-shoe check, upgrade suggestion.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useWatchStore }    from "../stores/watchStore.js";
import { useStrapStore }    from "../stores/strapStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useThemeStore }    from "../stores/themeStore.js";
import { getCachedState, setCachedState } from "../services/localCache.js";

const API         = "/.netlify/functions/selfie-check";
const EXTRACT_API = "/.netlify/functions/extract-outfit";
const SELFIE_CACHE_KEY = "selfieHistory";

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

function resizeImage(file, maxPx = 800, quality = 0.82) {
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
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const SCORE_COLOR = s => s >= 8 ? "#10b981" : s >= 6 ? "#f59e0b" : "#ef4444";

export default function SelfiePanel({ context = "smart-casual", watchId: propWatchId = null }) {
  const { mode }  = useThemeStore();
  const isDark    = mode === "dark";
  const watches   = useWatchStore(s => s.watches);
  const garments  = useWardrobeStore(s => s.garments);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const upsertEntry   = useHistoryStore(s => s.upsertEntry);
  const entries       = useHistoryStore(s => s.entries);
  // Active watch + strap — if no propWatchId, use first watch as fallback
  const activeWatchId = propWatchId ?? watches[0]?.id ?? null;
  const activeStrapObj = useStrapStore(s => s.getActiveStrap?.(activeWatchId)) ?? null;

  const [loading,      setLoading]      = useState(false);
  const [extracting,   setExtracting]   = useState(false);
  const [extractToast, setExtractToast] = useState(null); // {msg, ok}
  const [error,        setError]        = useState(null);
  const [photos,       setPhotos]       = useState([]); // [{id, dataUrl}]
  const [result,       setResult]       = useState(null);
  const [history,      setHistory]      = useState([]);

  // Load history from IDB on mount (survives refresh, unlike sessionStorage)
  useEffect(() => {
    getCachedState().then(cached => {
      if (Array.isArray(cached[SELFIE_CACHE_KEY])) setHistory(cached[SELFIE_CACHE_KEY]);
    });
  }, []);

  const cameraRef   = useRef();
  const frontRef    = useRef();
  const galleryRef  = useRef();

  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const bg2    = isDark ? "#0f131a" : "#f3f4f6";

  const addPhotos = useCallback(async (files) => {
    const newPhotos = [];
    const currentCount = photos.length;
    const totalAfter = Math.min(currentCount + files.length, 3);
    // Scale down when sending multiple images to prevent Netlify function timeout.
    // 1 photo: 800px/0.82q. 2 photos: 640px/0.75q. 3 photos: 512px/0.68q.
    // v2: reduced 1-photo from 800→640px — 800px was overkill for outfit analysis and contributed to 504s on mobile proxy.
    const maxPx = totalAfter <= 1 ? 640 : totalAfter <= 2 ? 512 : 420;
    const quality = totalAfter <= 1 ? 0.80 : totalAfter <= 2 ? 0.72 : 0.65;
    for (const file of files) {
      const dataUrl = await resizeImage(file, maxPx, quality);
      newPhotos.push({ id: Date.now() + Math.random(), dataUrl });
    }
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 3)); // max 3 photos — server cap for timeout
  }, [photos.length]);

  const removePhoto = useCallback((id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const check = useCallback(async () => {
    if (!photos.length) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const activeWatch = watches.find(w => w.id === activeWatchId) ?? null;
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: photos[0].dataUrl,
          images: photos.map(p => p.dataUrl),
          watches,
          garments: garments
            .filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo")
            .map(g => ({ id: g.id, name: g.name, type: g.type, color: g.color, formality: g.formality })),
          context,
          confirmedWatchId: activeWatchId,
          activeStrapLabel: activeStrapObj?.label ?? activeStrapObj?.color ?? activeWatch?.strap ?? null,
        }),
      });
      // Guard: Netlify returns HTML error pages on 502/504 timeout
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const status = res.status;
        if (status === 502 || status === 504) {
          throw new Error(`Function timed out (${status}). Try fewer photos or tap Check again.`);
        }
        // Try to get error body even on error status
        let errMsg = `Server error ${status}. Try again.`;
        try { const e = await res.json(); if (e.error) errMsg = e.error; } catch (_) {}
        throw new Error(errMsg);
      }
      // Status 200 but wrong content-type — still try to parse (Netlify may omit header)
      const data = contentType.includes("json")
        ? await res.json()
        : await res.text().then(t => JSON.parse(t.replace(/```json|```/g, "").trim()));
      if (data.error) throw new Error(data.error);
      setResult(data);
      const entry = { id: Date.now(), ts: new Date().toISOString(), preview: photos[0].dataUrl, photos: photos.map(p => p.dataUrl), result: data };
      setHistory(prev => {
        const next = [entry, ...prev].slice(0, 20);
        setCachedState({ [SELFIE_CACHE_KEY]: next }).catch(() => {});
        return next;
      });
    } catch (e) {
      setError(e.message ?? "AI check failed");
    } finally {
      setLoading(false);
    }
  }, [photos, watches, context, activeWatchId, activeStrapObj]);

  const handleFiles = useCallback(e => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addPhotos(files);
    e.target.value = "";
  }, [addPhotos]);

  // ── Extract garments from photo → populate today's history entry ─────────
  const extractAndUse = useCallback(async (photoDataUrl) => {
    setExtracting(true);
    setExtractToast(null);
    try {
      const activeGarments = garments.filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo");
      const res = await fetch(EXTRACT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photoDataUrl, garments: activeGarments }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const matchedIds = (data.matches ?? []).map(m => m.garmentId);
      if (!matchedIds.length) {
        setExtractToast({ msg: "No wardrobe matches found in photo", ok: false });
        return;
      }

      const TODAY = getTodayISO();
      const existing = entries.find(e => e.date === TODAY);
      const entry = {
        ...(existing ?? {}),
        id: existing?.id ?? `today-${Date.now()}`,
        date: TODAY,
        watchId: existing?.watchId ?? activeWatchId,
        garmentIds: matchedIds,
        loggedAt: new Date().toISOString(),
      };
      upsertEntry(entry);

      // Update lastWorn
      matchedIds.forEach(id => updateGarment(id, { lastWorn: TODAY }));

      setExtractToast({ msg: `✓ ${matchedIds.length} garment${matchedIds.length > 1 ? "s" : ""} set as today's outfit`, ok: true });
    } catch (e) {
      setExtractToast({ msg: e.message ?? "Extraction failed", ok: false });
    } finally {
      setExtracting(false);
      setTimeout(() => setExtractToast(null), 4000);
    }
  }, [garments, entries, activeWatchId, upsertEntry, updateGarment]);

  const clear = () => { setPhotos([]); setResult(null); setError(null); };

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Outfit Check</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        AI analyzes your full look — garments, watch, strap-shoe rule, color harmony.
      </div>

      {/* Upload area — always visible when no result */}
      {!result && (
        <div style={{ background: card, borderRadius: 16, border: `1px dashed ${border}`, padding: 20, marginBottom: 16 }}>
          {photos.length === 0 && (
            <div style={{ textAlign: "center", marginBottom: 16, fontSize: 40 }}>🪞</div>
          )}

          {/* Photo strip preview */}
          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
              {photos.map(p => (
                <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
                  <img src={p.dataUrl} alt="outfit"
                    style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 10,
                             border: `2px solid ${border}`, display: "block" }} />
                  <button onClick={() => removePhoto(p.id)}
                    style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff",
                             border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11,
                             cursor: "pointer", fontWeight: 700, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <label style={{ flexShrink: 0, width: 90, height: 120, borderRadius: 10,
                                border: `2px dashed ${border}`, display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", gap: 4,
                                cursor: "pointer", color: muted, fontSize: 22 }}>
                  +
                  <span style={{ fontSize: 10, fontWeight: 600 }}>Add</span>
                  <input type="file" accept="image/*" multiple
                         style={{ display: "none" }} onChange={handleFiles} />
                </label>
              )}
            </div>
          )}

          {/* Source buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              📷 Camera
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                     style={{ display: "none" }} onChange={handleFiles} />
            </label>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              🤳 Selfie
              <input ref={frontRef} type="file" accept="image/*" capture="user"
                     style={{ display: "none" }} onChange={handleFiles} />
            </label>
            <label style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${border}`,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", color: text, fontSize: 12, fontWeight: 600 }}>
              📁 Gallery
              <input ref={galleryRef} type="file" accept="image/*" multiple
                     style={{ display: "none" }} onChange={handleFiles} />
            </label>
          </div>

          {/* Check button — visible when photos selected */}
          {photos.length > 0 && !loading && (
            <button onClick={check}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, marginTop: 12,
                       background: "linear-gradient(135deg,#1e3a5f,#1e1b4b)", border: "1px solid #3b82f644",
                       color: "#93c5fd", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✨ Check Outfit {photos.length > 1 ? `(${photos.length} photos)` : ""}
            </button>
          )}

          {/* Loading overlay */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                          padding: "14px 0", marginTop: 12 }}>
              <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.2)",
                            borderTopColor: "#93c5fd", borderRadius: "50%",
                            animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: "#93c5fd", fontSize: 13, fontWeight: 600 }}>
                Analyzing {photos.length > 1 ? `${photos.length} angles` : "outfit"}…
              </span>
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

          {/* Photo strip in result */}
          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {photos.map((p, i) => (
                <img key={p.id ?? i} src={p.dataUrl} alt={`angle ${i + 1}`}
                  style={{ width: photos.length === 1 ? "100%" : 140,
                           height: photos.length === 1 ? "auto" : 180,
                           maxHeight: photos.length === 1 ? 400 : 180,
                           objectFit: "cover", borderRadius: 12, display: "block", flexShrink: 0 }} />
              ))}
            </div>
          )}

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

          {/* Extract toast */}
          {extractToast && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: extractToast.ok ? "#052e16" : "#450a0a",
              border: `1px solid ${extractToast.ok ? "#14532d" : "#7f1d1d"}`,
              color: extractToast.ok ? "#4ade80" : "#fca5a5",
            }}>{extractToast.msg}</div>
          )}

          {/* Use as today's outfit */}
          <button
            onClick={() => extractAndUse(photos[0]?.dataUrl)}
            disabled={extracting}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12,
              border: "1px solid #7c3aed44",
              background: extracting ? "transparent" : "linear-gradient(135deg,#1e1b4b,#1a1f2b)",
              color: extracting ? muted : "#a78bfa",
              fontSize: 14, fontWeight: 700, cursor: extracting ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {extracting ? (
              <>
                <div style={{ width: 14, height: 14, border: "2px solid rgba(167,139,250,0.3)",
                              borderTopColor: "#a78bfa", borderRadius: "50%",
                              animation: "spin 0.8s linear infinite" }} />
                Extracting…
              </>
            ) : "👕 Use as Today's Outfit"}
          </button>

          {/* New photo button */}
          <button onClick={clear}
            style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: `1px solid ${border}`,
                     background: "transparent", color: text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Check Another Outfit
          </button>
        </div>
      )}

      {/* History */}
      {!result && photos.length === 0 && history.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", marginBottom: 10, marginTop: 4 }}>Recent Checks</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {history.slice(0, 6).map(h => (
              <div key={h.id} style={{ borderRadius: 10, overflow: "hidden",
                                        border: `1px solid ${border}`, position: "relative" }}>
                <div style={{ cursor: "pointer" }}
                     onClick={() => {
                       const restored = (h.photos ?? [h.preview]).map((u, i) => ({ id: i, dataUrl: u }));
                       setPhotos(restored);
                       setResult(h.result);
                     }}>
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
                <button
                  onClick={e => { e.stopPropagation(); extractAndUse(h.preview); }}
                  disabled={extracting}
                  title="Use as today's outfit"
                  style={{
                    position: "absolute", top: 5, right: 5,
                    background: "rgba(124,58,237,0.88)", border: "none", borderRadius: 6,
                    padding: "2px 6px", fontSize: 11, fontWeight: 700, color: "#fff",
                    cursor: extracting ? "default" : "pointer",
                  }}>👕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
