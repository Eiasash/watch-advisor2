import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { setCachedState } from "../services/localCache.js";
import { pushGarment, uploadPhoto } from "../services/supabaseSync.js";
import { saveImage } from "../services/localCache.js";
import { useToast } from "./ToastProvider.jsx";

// ── Priority ordering: most-worn first ─────────────────────────────────────
function sortByWearCount(garments, history) {
  const wearCounts = {};
  for (const entry of history) {
    const ids = entry?.payload?.garmentIds ?? entry?.garmentIds ?? [];
    for (const gid of ids) {
      wearCounts[gid] = (wearCounts[gid] || 0) + 1;
    }
  }
  return [...garments].sort((a, b) => (wearCounts[b.id] || 0) - (wearCounts[a.id] || 0));
}

// ── Category label + emoji ─────────────────────────────────────────────────
const CAT_META = {
  belt:    { emoji: "🪢", label: "Belt" },
  jacket:  { emoji: "🧥", label: "Jacket" },
  pants:   { emoji: "👖", label: "Pants" },
  shirt:   { emoji: "👔", label: "Shirt" },
  shoes:   { emoji: "👟", label: "Shoes" },
  sweater: { emoji: "🧶", label: "Sweater" },
  accessory: { emoji: "✨", label: "Accessory" },
};

export default function BulkPhotoMode({ onClose }) {
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const watches = useWatchStore(s => s.watches) ?? [];
  const history = useHistoryStore(s => s.entries) ?? [];
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const addToast = useToast();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // Filter to garments without photos, sorted by wear frequency
  const queue = useMemo(() => {
    const noPhoto = garments.filter(g => {
      if (g.exclude_from_wardrobe || g.excludeFromWardrobe) return false;
      const cat = g.type || g.category;
      if (["outfit-photo", "watch", "outfit-shot"].includes(cat)) return false;
      // Check all possible photo field names (store fields + DB row spread fields)
      const hasPhoto = g.thumbnail || g.photoUrl || g.photo_url || g.thumbnail_url;
      return !hasPhoto;
    });
    return sortByWearCount(noPhoto, history);
  }, [garments, history]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [skipped, setSkipped] = useState(new Set());

  const current = queue[currentIdx];
  const totalRemaining = queue.length - completed - skipped.size;

  // ── Process photo ────────────────────────────────────────────────────────
  const processPhoto = useCallback(async (file) => {
    if (!file || !current) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            const scale = Math.min(1, 400 / Math.max(img.width, img.height));
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.75));
          };
          img.onerror = reject;
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Update store
      updateGarment(current.id, { thumbnail: dataUrl });
      // Persist to IDB
      const updated = useWardrobeStore.getState().garments;
      const ws = useWatchStore.getState().watches ?? [];
      const hist = useHistoryStore.getState().entries ?? [];
      setCachedState({ watches: ws, garments: updated, history: hist }).catch(() => {});
      // Save image to IDB
      saveImage(current.id, dataUrl).catch(() => {});
      // Push to Supabase
      pushGarment({ ...current, thumbnail: dataUrl }).catch(() => {});
      uploadPhoto(current.id, dataUrl, "thumbnail").catch(() => {});

      setCompleted(c => c + 1);
      addToast?.(`📸 ${current.name} — done`, "success");
      // Auto-advance
      advanceToNext();
    } catch (err) {
      addToast?.("Photo failed — try again", "error");
    } finally {
      setUploading(false);
    }
  }, [current, updateGarment, addToast]);

  // ── Navigation ───────────────────────────────────────────────────────────
  function advanceToNext() {
    setCurrentIdx(prev => {
      let next = prev + 1;
      // Skip already-completed or skipped items
      while (next < queue.length && skipped.has(queue[next]?.id)) next++;
      return Math.min(next, queue.length);
    });
  }

  function handleSkip() {
    if (!current) return;
    setSkipped(s => new Set(s).add(current.id));
    advanceToNext();
  }

  function handleGallery() { fileRef.current?.click(); }
  function handleCamera() { cameraRef.current?.click(); }
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processPhoto(file);
  }

  // ── Swipe handling ───────────────────────────────────────────────────────
  const touchStart = useRef(null);
  function onTouchStart(e) { touchStart.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (dx < -60) handleSkip(); // swipe left = skip
  }

  // ── All done ─────────────────────────────────────────────────────────────
  const allDone = currentIdx >= queue.length || !current;

  // ── Styles ───────────────────────────────────────────────────────────────
  const bg = isDark ? "#0f131a" : "#f9fafb";
  const card = isDark ? "#1a1f2e" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const sub = isDark ? "#8b93a7" : "#6b7280";
  const accent = "#3b82f6";

  if (allDone) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:bg, display:"flex",
        flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
        <h2 style={{ color:text, margin:0, fontSize:22, fontWeight:700 }}>All done!</h2>
        <p style={{ color:sub, margin:"8px 0 24px", fontSize:14, textAlign:"center" }}>
          {completed} photo{completed !== 1 ? "s" : ""} added
          {skipped.size > 0 && `, ${skipped.size} skipped`}
        </p>
        <button onClick={onClose} style={{
          background:accent, color:"#fff", border:"none", borderRadius:12, padding:"12px 32px",
          fontSize:15, fontWeight:600, cursor:"pointer"
        }}>Done</button>
      </div>
    );
  }

  const catMeta = CAT_META[current.category || current.type] || { emoji:"👕", label:current.category || current.type };
  const wearCount = history.filter(h => {
    const ids = h?.payload?.garmentIds ?? h?.garmentIds ?? [];
    return ids.includes(current.id);
  }).length;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:bg, display:"flex",
      flexDirection:"column", overflow:"hidden" }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"12px 16px", borderBottom:`1px solid ${border}` }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:sub,
          fontSize:14, cursor:"pointer", padding:4 }}>✕ Close</button>
        <span style={{ color:text, fontSize:13, fontWeight:600 }}>
          📸 Bulk Photo ({completed + skipped.size + 1}/{queue.length})
        </span>
        <span style={{ color:sub, fontSize:12 }}>
          {totalRemaining} left
        </span>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────── */}
      <div style={{ height:3, background:border }}>
        <div style={{ height:"100%", background:accent, transition:"width 0.3s ease",
          width:`${((completed + skipped.size) / queue.length) * 100}%` }} />
      </div>

      {/* ── Main card ──────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", padding:"24px 20px", gap:16 }}>

        {/* Category badge */}
        <div style={{ display:"flex", alignItems:"center", gap:6, color:sub, fontSize:12, fontWeight:500 }}>
          <span>{catMeta.emoji}</span>
          <span style={{ textTransform:"uppercase", letterSpacing:1 }}>{catMeta.label}</span>
          {wearCount > 0 && (
            <span style={{ background:isDark ? "#374151" : "#e5e7eb", borderRadius:8,
              padding:"2px 8px", fontSize:11, color:text }}>
              worn {wearCount}×
            </span>
          )}
        </div>

        {/* Garment name */}
        <h1 style={{ color:text, fontSize:20, fontWeight:700, margin:0, textAlign:"center",
          lineHeight:1.3, maxWidth:300 }}>
          {current.name}
        </h1>

        {/* Color + brand */}
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          {current.color && (
            <span style={{ display:"flex", alignItems:"center", gap:4, color:sub, fontSize:13 }}>
              <span style={{ width:14, height:14, borderRadius:"50%", display:"inline-block",
                border:`1px solid ${border}`,
                background: current.color === "multicolor"
                  ? "linear-gradient(135deg,#f43f5e,#3b82f6,#10b981)"
                  : undefined,
                backgroundColor: current.color !== "multicolor"
                  ? (current.colorHex || sub)
                  : undefined
              }} />
              {current.color}
            </span>
          )}
          {current.brand && (
            <span style={{ color:sub, fontSize:13 }}>{current.brand}</span>
          )}
        </div>

        {/* Big photo placeholder */}
        <div style={{
          width:180, height:220, borderRadius:16, border:`2px dashed ${border}`,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          background: isDark ? "#1e2333" : "#f3f4f6", gap:8, marginTop:8
        }}>
          <span style={{ fontSize:48, opacity:0.4 }}>📷</span>
          <span style={{ color:sub, fontSize:12 }}>No photo yet</span>
        </div>

        {/* Notes */}
        {current.notes && (
          <p style={{ color:sub, fontSize:12, textAlign:"center", maxWidth:280,
            margin:0, fontStyle:"italic" }}>
            {current.notes}
          </p>
        )}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div style={{ padding:"16px 20px 28px", display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={handleCamera} disabled={uploading} style={{
            flex:1, padding:"14px 0", borderRadius:12, border:"none",
            background:accent, color:"#fff", fontSize:15, fontWeight:600,
            cursor:"pointer", opacity:uploading ? 0.6 : 1, display:"flex",
            alignItems:"center", justifyContent:"center", gap:8
          }}>
            📷 Camera
          </button>
          <button onClick={handleGallery} disabled={uploading} style={{
            flex:1, padding:"14px 0", borderRadius:12, border:`1.5px solid ${accent}`,
            background:"transparent", color:accent, fontSize:15, fontWeight:600,
            cursor:"pointer", opacity:uploading ? 0.6 : 1, display:"flex",
            alignItems:"center", justifyContent:"center", gap:8
          }}>
            🖼️ Gallery
          </button>
        </div>
        <button onClick={handleSkip} disabled={uploading} style={{
          padding:"12px 0", borderRadius:12, border:`1px solid ${border}`,
          background:"transparent", color:sub, fontSize:14, cursor:"pointer"
        }}>
          Skip →
        </button>
        {uploading && (
          <p style={{ textAlign:"center", color:accent, fontSize:13, margin:0 }}>
            Uploading…
          </p>
        )}
      </div>

      {/* Hidden file inputs */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
        onChange={handleFileChange} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        style={{ display:"none" }} onChange={handleFileChange} />
    </div>
  );
}
