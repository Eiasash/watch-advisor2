/**
 * TodayPanel — "What I'm wearing today"
 * Pick garments (multi-select from wardrobe + camera/gallery)
 * Pick a watch + strap
 * Log to history
 */
import React, { useState, useRef, useCallback, useMemo } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore }    from "../stores/watchStore.js";
import { useStrapStore }    from "../stores/strapStore.js";
import { useHistoryStore }  from "../stores/historyStore.js";
import { useThemeStore }    from "../stores/themeStore.js";

import SelfiePanel from "./SelfiePanel.jsx";

const TODAY_ISO = new Date().toISOString().split("T")[0];
const CONTEXT_OPTIONS = [
  { key: "smart-casual",          label: "Smart Casual" },
  { key: "hospital-smart-casual", label: "Clinic / Hospital" },
  { key: "formal",                label: "Formal" },
  { key: "casual",                label: "Casual" },
  { key: "shift",                 label: "On-Call" },
];
const GARMENT_PRIORITY = ["shoes","pants","shirt","sweater","jacket"];

function resizeImage(file, maxPx = 480) {
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

// ── Garment thumbnail ─────────────────────────────────────────────────────────
function GarmentThumb({ g, selected, onClick, isDark }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div onClick={onClick}
      style={{ position: "relative", cursor: "pointer", borderRadius: 10, overflow: "hidden",
               border: `2px solid ${selected ? "#3b82f6" : border}`,
               background: isDark ? "#0f131a" : "#f3f4f6",
               transition: "border-color 0.12s" }}>
      {(g.thumbnail || g.photoUrl) ? (
        <img src={g.thumbnail || g.photoUrl} alt={g.name}
          style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ fontSize: 24 }}>👕</div>
          <div style={{ fontSize: 9, color: isDark ? "#4b5563" : "#9ca3af", textAlign: "center", padding: "0 4px" }}>
            {g.name?.slice(0,18)}
          </div>
        </div>
      )}
      {selected && (
        <div style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%",
                      background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,#00000088)",
                    padding: "12px 4px 4px", fontSize: 9, color: "#fff", textAlign: "center", fontWeight: 600 }}>
        {g.type?.toUpperCase()}
      </div>
    </div>
  );
}

export default function TodayPanel() {
  const { mode }     = useThemeStore();
  const isDark       = mode === "dark";
  const garments     = useWardrobeStore(s => s.garments);
  const watches      = useWatchStore(s => s.watches);
  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const addEntry     = useHistoryStore(s => s.addEntry);
  const entries      = useHistoryStore(s => s.entries);

  // Today's already-logged entry (if any)
  const todayEntry = useMemo(() => entries.find(e => e.date === TODAY_ISO), [entries]);

  const [selected, setSelected]   = useState(new Set(todayEntry?.garmentIds ?? []));
  const [watchId,  setWatchId]    = useState(todayEntry?.watchId  ?? watches[0]?.id ?? null);
  const [context,  setContext]    = useState(todayEntry?.context  ?? "smart-casual");
  const [notes,    setNotes]      = useState(todayEntry?.notes    ?? "");
  const [extraImg, setExtraImg]   = useState(null); // outfit photo from camera
  const [logged,   setLogged]     = useState(!!todayEntry);
  const [filter,   setFilter]     = useState("all");
  const cameraRef = useRef();

  const bg     = isDark ? "#101114" : "#f9fafb";
  const card   = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const muted  = isDark ? "#6b7280" : "#9ca3af";

  const activeGarments = useMemo(() =>
    garments.filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo" && g.type !== "outfit-shot"),
    [garments]
  );

  const garmentTypes = useMemo(() => {
    const types = new Set(activeGarments.map(g => g.type).filter(Boolean));
    return ["all", ...GARMENT_PRIORITY.filter(t => types.has(t)), ...[...types].filter(t => !GARMENT_PRIORITY.includes(t))];
  }, [activeGarments]);

  const visible = filter === "all" ? activeGarments : activeGarments.filter(g => g.type === filter);

  const selectedWatch = watches.find(w => w.id === watchId);
  const watchStraps   = Object.values(straps).filter(s => s.watchId === watchId);
  const activeStrapId = activeStrap[watchId];
  const activeStrapObj = activeStrapId ? straps[activeStrapId] : null;

  const toggleGarment = id => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleCamera = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const thumb = await resizeImage(f, 600);
    setExtraImg(thumb);
    e.target.value = "";
  }, []);

  const handleLog = useCallback(async () => {
    if (!watchId) return;
    const entry = {
      id: `today-${Date.now()}`,
      date: TODAY_ISO,
      watchId,
      strapId: activeStrapId ?? null,
      strapLabel: activeStrapObj?.label ?? null,
      garmentIds: [...selected],
      context,
      notes: notes.trim() || null,
      outfitPhoto: extraImg ?? null,
      loggedAt: new Date().toISOString(),
    };
    addEntry(entry, wornGarments);
    // Style learning — record worn garments in preference profile
    try {
      const { usePrefStore } = await import("../stores/prefStore.js");
      const wornG = garments.filter(g => selected.has(g.id));
      usePrefStore.getState().recordWear(wornG);
    } catch(_) {}
    setLogged(true);
  }, [watchId, activeStrapId, activeStrapObj, selected, context, notes, extraImg, addEntry, garments]);

  // ── Summary card when already logged ────────────────────────────────────────
  if (logged && todayEntry) {
    const watch = watches.find(w => w.id === todayEntry.watchId);
    const wornGarments = garments.filter(g => (todayEntry.garmentIds ?? []).includes(g.id));
    return (
      <div style={{ padding: "0 0 80px" }}>
        <div style={{ background: card, borderRadius: 16, border: `1px solid ${border}`, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Today ✅</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>{TODAY_ISO} · {todayEntry.context}</div>

          {watch && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
                          padding: "10px 14px", borderRadius: 10, background: isDark ? "#0f131a" : "#f3f4f6",
                          border: `1px solid ${border}` }}>
              <div style={{ fontSize: 28 }}>{watch.emoji ?? "⌚"}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{watch.brand} {watch.model}</div>
                <div style={{ fontSize: 11, color: muted }}>
                  {todayEntry.strapLabel ?? watch.dial + " dial"}
                </div>
              </div>
            </div>
          )}

          {wornGarments.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: 8 }}>
              {wornGarments.map(g => (
                <div key={g.id} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
                  {(g.thumbnail || g.photoUrl) ? (
                    <img src={g.thumbnail || g.photoUrl} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "3/4", display: "flex", alignItems: "center",
                                  justifyContent: "center", background: isDark ? "#0f131a" : "#f3f4f6", fontSize: 20 }}>👕</div>
                  )}
                  <div style={{ padding: "2px 4px", fontSize: 9, color: muted, textAlign: "center" }}>{g.name?.slice(0,14)}</div>
                </div>
              ))}
            </div>
          )}

          {todayEntry.outfitPhoto && (
            <img src={todayEntry.outfitPhoto} alt="outfit"
              style={{ width: "100%", borderRadius: 10, marginTop: 12, objectFit: "cover", maxHeight: 300 }} />
          )}

          {todayEntry.notes && (
            <div style={{ marginTop: 12, fontSize: 12, color: muted, fontStyle: "italic" }}>{todayEntry.notes}</div>
          )}
        </div>

        <SelfiePanel context={todayEntry?.context ?? "smart-casual"} />

        <button onClick={() => setLogged(false)} style={{ width: "100%", padding: "12px 0", borderRadius: 10,
          border: `1px solid ${border}`, background: "transparent", color: muted, fontSize: 13, cursor: "pointer" }}>
          Edit today's log
        </button>
      </div>
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: text, marginBottom: 4 }}>Today</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>{TODAY_ISO} — What are you wearing?</div>

      {/* Context */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>Context</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CONTEXT_OPTIONS.map(c => (
            <button key={c.key} onClick={() => setContext(c.key)}
              style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 600,
                       cursor: "pointer",
                       background: context === c.key ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                       color: context === c.key ? "#fff" : muted }}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* Watch picker */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>Watch</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {watches.map(w => (
            <div key={w.id} onClick={() => setWatchId(w.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
                       border: `2px solid ${watchId === w.id ? "#3b82f6" : border}`, cursor: "pointer",
                       background: watchId === w.id ? (isDark ? "#0c1f3f" : "#eff6ff") : "transparent" }}>
              <div style={{ fontSize: 22 }}>{w.emoji ?? "⌚"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{w.brand} {w.model}</div>
                <div style={{ fontSize: 11, color: muted }}>{w.dial} dial{w.replica ? " · replica" : " · genuine"}</div>
              </div>
              {watchId === w.id && <div style={{ color: "#3b82f6", fontWeight: 700, fontSize: 16 }}>✓</div>}
            </div>
          ))}
        </div>

        {/* Strap picker for selected watch */}
        {watchStraps.length > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 600, marginBottom: 8 }}>STRAP</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {watchStraps.map(s => (
                <button key={s.id}
                  onClick={() => useStrapStore.getState().setActiveStrap(watchId, s.id)}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${activeStrapId === s.id ? "#3b82f6" : border}`,
                           background: activeStrapId === s.id ? "#3b82f622" : "transparent",
                           color: activeStrapId === s.id ? "#3b82f6" : muted,
                           fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Garment picker */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Garments {selected.size > 0 && <span style={{ color: "#3b82f6" }}>({selected.size})</span>}
          </div>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())}
              style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
              Clear all
            </button>
          )}
        </div>

        {/* Type filter */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
          {garmentTypes.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: "4px 10px", borderRadius: 14, border: "none", fontSize: 11, fontWeight: 600,
                       whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
                       background: filter === t ? "#3b82f6" : (isDark ? "#1a1f2b" : "#f3f4f6"),
                       color: filter === t ? "#fff" : muted }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 8 }}>
          {visible.map(g => (
            <GarmentThumb key={g.id} g={g} selected={selected.has(g.id)}
              onClick={() => toggleGarment(g.id)} isDark={isDark} />
          ))}
        </div>
      </div>

      {/* Outfit photo */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 10 }}>Outfit Photo (optional)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px dashed ${border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          cursor: "pointer", color: muted, fontSize: 13 }}>
            📁 Gallery
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleCamera} />
          </label>
          <label style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px dashed ${border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          cursor: "pointer", color: muted, fontSize: 13 }}>
            📷 Camera
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleCamera} />
          </label>
        </div>
        {extraImg && (
          <div style={{ marginTop: 10, position: "relative" }}>
            <img src={extraImg} alt="outfit" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 260 }} />
            <button onClick={() => setExtraImg(null)}
              style={{ position: "absolute", top: 6, right: 6, background: "#ef4444", color: "#fff",
                       border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: 13, cursor: "pointer" }}>×</button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 16, marginBottom: 20 }}>
        <textarea placeholder="Notes (optional)…" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none",
                   color: text, fontSize: 13, resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>

      {/* Log button */}
      <button onClick={handleLog} disabled={!watchId}
        style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
                 background: watchId ? "#3b82f6" : "#374151", color: "#fff",
                 fontSize: 16, fontWeight: 800, cursor: watchId ? "pointer" : "not-allowed" }}>
        Log Today's Outfit ✓
      </button>
    </div>
  );
}
