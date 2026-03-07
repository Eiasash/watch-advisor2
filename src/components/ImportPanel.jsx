import React, { useState, useRef, useCallback } from "react";
import { runClassifierPipeline } from "../classifier/pipeline.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { pushGarment, uploadPhoto } from "../services/supabaseSync.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { useToast } from "./ToastProvider.jsx";

const MAX_ANGLES = 4;

/** dHash Hamming distance — compare two 64-bit hex strings */
function hammingDist(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let dist = 0;
  for (let i = 0; i < a.length; i += 2) {
    const diff = parseInt(a.slice(i, i+2), 16) ^ parseInt(b.slice(i, i+2), 16);
    for (let x = diff; x; x &= x-1) dist++;
  }
  return dist;
}

/** Group batch items: if Hamming ≤ 8, second is angle of first primary */
function groupByAngles(items) {
  const groups = []; // [{ primary, angles: [] }]
  const assigned = new Set();
  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const group = { primary: items[i], angles: [] };
    assigned.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (hammingDist(items[i].hash, items[j].hash) <= 8) {
        group.angles.push(items[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

export default function ImportPanel() {
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const [dupeModal, setDupeModal] = useState(null); // { newItem, existing } when cross-batch dupe found

  const addGarment  = useWardrobeStore(s => s.addGarment);
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const garments    = useWardrobeStore(s => s.garments);
  const watches     = useWatchStore(s => s.watches);
  const history     = useHistoryStore(s => s.entries);
  const { mode }    = useThemeStore();
  const isDark      = mode === "dark";
  const toast       = useToast();
  const garmentsRef = useRef(garments);
  garmentsRef.current = garments;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    setBusy(true);
    setProgress({ done: 0, total: files.length, errors: [] });

    const processed = [];
    const errors    = [];

    for (let i = 0; i < files.length; i++) {
      setProgress(p => ({ ...p, done: i }));
      try {
        const g = await runClassifierPipeline(files[i], garmentsRef.current);
        processed.push(g);
      } catch (err) {
        errors.push(files[i].name);
      }
      setProgress(p => ({ ...p, done: i + 1, errors: [...errors] }));
    }

    // ── Group by angles within this batch ──────────────────────────────────
    const groups = groupByAngles(processed);
    let imported = 0;
    let autoAngles = 0;

    for (const group of groups) {
      const primary = group.primary;
      // Merge angle thumbnails into primary
      const batchAngles = group.angles.map(a => a.thumbnail).filter(Boolean);
      const finalItem = {
        ...primary,
        photoAngles: [...(primary.photoAngles ?? []), ...batchAngles].slice(0, MAX_ANGLES),
      };

      // Check if this matches an EXISTING garment (cross-session dupe)
      const existingDupe = garmentsRef.current.find(ex =>
        ex.hash && primary.hash && hammingDist(ex.hash, primary.hash) <= 6
      );

      if (existingDupe && primary.type === existingDupe.type) {
        // Add as angle to existing, don't create new garment
        const existAngles = existingDupe.photoAngles ?? [];
        if (existAngles.length < MAX_ANGLES && primary.thumbnail) {
          const newAngles = [...existAngles, primary.thumbnail].slice(0, MAX_ANGLES);
          updateGarment(existingDupe.id, { photoAngles: newAngles });
          if (toast) toast.addToast(`📐 Added angle to "${existingDupe.name}"`, "info", 2500);
        } else {
          if (toast) toast.addToast(`⚠ Duplicate of "${existingDupe.name}" skipped`, "warning", 2500);
        }
        continue;
      }

      addGarment(finalItem);
      garmentsRef.current = [...garmentsRef.current, finalItem];
      // Push metadata to DB
      pushGarment(finalItem).catch(() => {});
      // Upload thumbnail to Supabase Storage (persistent cross-device photo)
      if (finalItem.thumbnail) {
        uploadPhoto(finalItem.id, finalItem.thumbnail, "thumbnail")
          .then(url => {
            if (url) pushGarment({ ...finalItem, photoUrl: url }).catch(() => {});
          })
          .catch(() => {});
      }
      imported++;
      if (group.angles.length > 0) autoAngles += group.angles.length;
    }

    const latest = [...garmentsRef.current];
    await setCachedState({ watches, garments: latest, history });
    setBusy(false);
    setProgress({ done: 0, total: 0, errors: [] });

    let msg = `Imported ${imported} garment${imported !== 1 ? "s" : ""}`;
    if (autoAngles) msg += ` · ${autoAngles} angle${autoAngles > 1 ? "s" : ""} auto-grouped`;
    if (errors.length) msg += ` · ${errors.length} failed`;
    if (toast) toast.addToast(msg, errors.length ? "warning" : "success");
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const bg = isDark ? "#171a21" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const sub = isDark ? "#8b93a7" : "#6b7280";

  return (
    <div style={{ padding:"16px 18px", borderRadius:16, background:bg, border:`1px solid ${border}` }}>
      <h3 style={{ marginTop:0, marginBottom:12, fontSize:15, fontWeight:700, color:isDark?"#e2e8f0":"#1f2937" }}>
        Import Garments
      </h3>

      {/* Import buttons — side by side on mobile */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        {/* Gallery */}
        <label style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"20px 12px", minHeight:80, borderRadius:12, textAlign:"center",
          border:`2px dashed ${isDark?"#2b3140":"#d1d5db"}`,
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
        }}>
          <input type="file" multiple accept="image/*" disabled={busy} onChange={handleFiles} style={{ display:"none" }} />
          <div style={{ fontSize:26, marginBottom:4 }}>🗂️</div>
          <div style={{ fontSize:12, fontWeight:600, color:isDark?"#a1a9b8":"#4b5563" }}>Gallery</div>
          <div style={{ fontSize:10, color:sub, marginTop:2 }}>Multi-select</div>
        </label>
        {/* Camera */}
        <label style={{
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          padding:"20px 12px", minHeight:80, borderRadius:12, textAlign:"center",
          border:`1px solid ${isDark?"#2b3140":"#d1d5db"}`,
          background: isDark ? "#0f131a" : "#f9fafb",
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
        }}>
          <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={handleFiles} style={{ display:"none" }} />
          <div style={{ fontSize:26, marginBottom:4 }}>📷</div>
          <div style={{ fontSize:12, fontWeight:600, color:isDark?"#a1a9b8":"#4b5563" }}>Camera</div>
          <div style={{ fontSize:10, color:sub, marginTop:2 }}>Take photo</div>
        </label>
      </div>
      {/* Progress bar */}
      {busy && (
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:12, color:sub, marginBottom:4, textAlign:"center" }}>Importing {progress.done}/{progress.total}…</div>
          <div style={{ height:4, borderRadius:2, background:isDark?"#2b3140":"#d1d5db", overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:2, background:"#3b82f6", width:pct+"%", transition:"width 0.15s" }} />
          </div>
        </div>
      )}

      {progress.errors.length > 0 && !busy && (
        <div style={{ fontSize:12, color:"#ef4444", marginTop:4 }}>
          Failed: {progress.errors.join(", ")}
        </div>
      )}
      <div style={{ fontSize:10, color:sub, lineHeight:1.5 }}>
        Camera roll photos auto-named by type & color · same item auto-grouped
      </div>
    </div>
  );
}
