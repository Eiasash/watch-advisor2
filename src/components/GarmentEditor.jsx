import React, { useState, useCallback } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { pushGarment, deleteGarment, deleteStoragePhoto, uploadAngle } from "../services/supabaseSync.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

const CATEGORIES = [
  "shirt","pants","shoes","jacket","sweater",
  "belt","sunglasses","hat","scarf","bag","accessory","outfit-photo",
];
const COLORS = [
  "black","white","navy","blue","grey","brown","tan","beige",
  "olive","green","red","burgundy","cream","orange","yellow","purple","pink",
  "charcoal","khaki","teal","camel","rust","maroon","ivory","slate",
  "mint","lavender","sage","wine","taupe","cognac","sand","denim",
  "coral","dark brown","light blue","multicolor",
];
const FORMALITY_LABELS = {
  1:"Very casual",2:"Casual",3:"Relaxed",4:"Smart casual light",5:"Smart casual",
  6:"Business casual",7:"Business",8:"Smart formal",9:"Formal",10:"Black tie",
};

export default function GarmentEditor({ garment, onClose }) {
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const removeGarment = useWardrobeStore(s => s.removeGarment);
  const addAngle      = useWardrobeStore(s => s.addAngle);
  const garments      = useWardrobeStore(s => s.garments);
  const watches       = useWatchStore(s => s.watches);
  const history       = useHistoryStore(s => s.entries);
  const { mode }      = useThemeStore();
  const isDark        = mode === "dark";

  const [name,     setName]     = useState(garment.name ?? "");
  const [category, setCategory] = useState(garment.type ?? garment.category ?? "shirt");
  const [color,    setColor]    = useState(garment.color ?? "grey");
  const [formality,setFormality]= useState(garment.formality ?? 5);
  const [brand,    setBrand]    = useState(garment.brand ?? "");
  const [notes,    setNotes]    = useState(garment.notes ?? "");
  const [price,    setPrice]    = useState(garment.price ?? "");
  const [angleIdx, setAngleIdx] = useState(0); // 0 = primary photo

  const angles = [garment.thumbnail].concat(garment.photoAngles ?? []).filter(Boolean);

  function handleSave() {
    const updates = { name, type: category, color, formality, brand, notes, needsReview: false, price: price ? parseFloat(price) : undefined };
    updateGarment(garment.id, updates);
    const updated = garments.map(g => g.id === garment.id ? { ...g, ...updates } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    // Push edit to cloud
    pushGarment({ ...garment, ...updates }).catch(() => {});
    onClose();
  }

  // ── AI photo label check ──────────────────────────────────────────────────
  const [aiChecking, setAiChecking]     = useState(false);
  const [aiResult,   setAiResult]       = useState(null); // { confirmed, corrections, reason, confidence }

  const handleAiCheck = useCallback(async () => {
    const photo = garment.thumbnail || garment.photoUrl;
    if (!photo) return;
    setAiChecking(true);
    setAiResult(null);
    try {
      const res = await fetch("/.netlify/functions/relabel-garment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Route correctly: Storage URLs are https://, data URIs start with data:
          image: photo,
          current: { type: category, color, name, formality },
        }),
      });
      const data = await res.json();
      setAiResult(data);
    } catch (err) {
      setAiResult({ error: err.message });
    }
    setAiChecking(false);
  }, [garment, category, color, name, formality]);

  const applyAiCorrections = useCallback(() => {
    if (!aiResult?.corrections) return;
    const c = aiResult.corrections;
    const newCategory = c.type     ?? category;
    const newColor    = c.color    ?? color;
    const newName     = c.name     ?? name;
    const newFormality = c.formality != null ? c.formality : formality;
    // Update form state
    if (c.type)      setCategory(newCategory);
    if (c.color)     setColor(newColor);
    if (c.name)      setName(newName);
    if (c.formality) setFormality(newFormality);
    // Auto-save immediately — don't rely on user clicking Save
    const updates = { name: newName, type: newCategory, color: newColor, formality: newFormality, needsReview: false };
    updateGarment(garment.id, updates);
    const updated = { ...garment, ...updates };
    pushGarment(updated).catch(e => console.warn("[GarmentEditor] applyAiCorrections push failed:", e.message));
    const updatedGarments = garments.map(g => g.id === garment.id ? updated : g);
    setCachedState({ watches, garments: updatedGarments, history }).catch(() => {});
    setAiResult(null);
  }, [aiResult, category, color, name, formality, garment, garments, watches, history, updateGarment]);

  function handleDelete() {
    removeGarment(garment.id);
    setCachedState({ watches, garments: garments.filter(g => g.id !== garment.id), history }).catch(() => {});
    // Delete from cloud DB and Storage
    deleteGarment(garment.id).catch(() => {});
    deleteStoragePhoto(garment.id).catch(() => {});
    onClose();
  }

  async function handleAngleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 300 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const thumb = c.toDataURL("image/jpeg", 0.7);

        // Store base64 locally for instant display
        addAngle(garment.id, thumb);
        const newAnglesLocal = (garment.photoAngles ?? []).concat([thumb]);
        const updatedLocal = garments.map(g => g.id === garment.id ? { ...g, photoAngles: newAnglesLocal } : g);
        setCachedState({ watches, garments: updatedLocal, history }).catch(() => {});
        setAngleIdx(angles.length);

        // Upload to Storage in background — replace base64 with persistent URL in DB
        const angleIndex = (garment.photoAngles ?? []).length;
        try {
          const url = await uploadAngle(garment.id, angleIndex, thumb);
          if (url) {
            // Rebuild photoAngles: replace base64 entries with Storage URLs where available
            const existingUrls = (garment.photoAngles ?? []).filter(u => u && !u.startsWith("data:"));
            const newAnglesCloud = [...existingUrls, url];
            pushGarment({ ...garment, photoAngles: newAnglesCloud }).catch(() => {});
          }
        } catch {
          // Upload failed — base64 stays local, angle not persisted to cloud
          console.warn("[GarmentEditor] angle upload failed — local only");
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const bg    = isDark ? "#171a21" : "#fff";
  const panelBg = isDark ? "#0f131a" : "#f3f4f6";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";
  const inp    = { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${border}`,
                   background:panelBg, color:text, fontSize:13, boxSizing:"border-box" };

  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
               display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:bg, borderRadius:18, padding:"22px 24px",
                 border:`1px solid ${border}`, width:380, maxWidth:"94vw", maxHeight:"90vh",
                 overflowY:"auto", boxSizing:"border-box" }}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:text }}>Edit Garment</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:sub, fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>

        {/* Photo carousel */}
        {angles.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <img
              src={angles[angleIdx]}
              alt={name}
              style={{ width:"100%", height:170, objectFit:"cover", borderRadius:10 }}
            />
            {angles.length > 1 && (
              <div style={{ display:"flex", gap:6, marginTop:6, justifyContent:"center" }}>
                {angles.map((a, i) => (
                  <button key={i} onClick={() => setAngleIdx(i)} style={{
                    width:32, height:32, borderRadius:6, overflow:"hidden", padding:0,
                    border:`2px solid ${i === angleIdx ? "#3b82f6" : border}`, cursor:"pointer",
                  }}>
                    <img src={a} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  </button>
                ))}
                {angles.length < 5 && (
                  <label style={{ width:32, height:32, borderRadius:6, border:`2px dashed ${border}`,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:18, cursor:"pointer", color:sub }}>
                    +
                    <input type="file" accept="image/*" onChange={handleAngleUpload} style={{ display:"none" }} />
                  </label>
                )}
              </div>
            )}
            {angles.length === 1 && (
              <div style={{ marginTop:6, textAlign:"center" }}>
                <label style={{ fontSize:12, color:"#3b82f6", cursor:"pointer" }}>
                  + Add angle photo
                  <input type="file" accept="image/*" onChange={handleAngleUpload} style={{ display:"none" }} />
                </label>
              </div>
            )}
          </div>
        )}

        {/* Name */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, marginBottom:10 }} />

        {/* Category */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, marginBottom:10 }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Color */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>Color</label>
        <select value={color} onChange={e => setColor(e.target.value)} style={{ ...inp, marginBottom:10 }}>
          {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Formality */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>
          Formality {formality}/10 — {FORMALITY_LABELS[formality]}
        </label>
        <input type="range" min={1} max={10} value={formality}
          onChange={e => setFormality(Number(e.target.value))}
          style={{ width:"100%", marginBottom:10 }} />

        {/* Brand */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>Brand</label>
        <input value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inp, marginBottom:10 }}
          placeholder="e.g. Gant, Massimo Dutti" />

        {/* Notes */}
        <label style={{ display:"block", fontSize:12, fontWeight:600, color:sub, marginBottom:3 }}>Notes</label>
        <input value={price} onChange={e => setPrice(e.target.value)} type="number" min="0" step="1" style={{ ...inp, marginBottom:10 }}
          placeholder="Price paid ₪ (for cost-per-wear)" />
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} style={{ ...inp, resize:"vertical", marginBottom:10 }}
          placeholder="Pairing notes, fit, condition…" />

        {/* Last worn (read-only — set automatically on log) */}
        {garment.lastWorn && (() => {
          const d = Math.floor((Date.now() - new Date(garment.lastWorn).getTime()) / 864e5);
          const col = d <= 3 ? "#4ade80" : d <= 14 ? "#f59e0b" : "#9ca3af";
          return (
            <div style={{ fontSize:11, color:col, marginBottom:14 }}>
              Last worn: {garment.lastWorn} ({d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`})
            </div>
          );
        })()}

        {/* AI Photo Check */}
        {(garment.thumbnail || garment.photoUrl) && (
          <div style={{ marginBottom:10 }}>
            <button onClick={handleAiCheck} disabled={aiChecking}
              style={{ width:"100%", padding:"8px 0", borderRadius:9, border:"1px solid #4b5563",
                       background:"transparent", color: isDark ? "#e2e8f0" : "#374151",
                       fontSize:13, fontWeight:600, cursor:aiChecking?"wait":"pointer" }}>
              {aiChecking ? "🔍 Checking photo…" : "🔍 AI check label"}
            </button>
            {aiResult && !aiResult.error && (
              <div style={{ marginTop:8, padding:"10px 12px", borderRadius:9,
                            background: aiResult.confirmed ? (isDark?"#0a1f0a":"#f0fdf4") : (isDark?"#1f0a0a":"#fff7f7"),
                            border:`1px solid ${aiResult.confirmed?"#16a34a":"#ef4444"}` }}>
                <div style={{ fontSize:12, fontWeight:700,
                              color: aiResult.confirmed?"#16a34a":"#ef4444", marginBottom:4 }}>
                  {aiResult.confirmed ? "✓ Label correct" : "⚠ Possible mislabel"}
                  <span style={{ fontWeight:400, color: isDark?"#8b93a7":"#6b7280", marginLeft:6 }}>
                    {Math.round((aiResult.confidence ?? 0) * 100)}% confidence
                  </span>
                </div>
                <div style={{ fontSize:11, color: isDark?"#e2e8f0":"#374151", marginBottom:6 }}>
                  {aiResult.reason}
                </div>
                {!aiResult.confirmed && aiResult.corrections && (
                  <div style={{ fontSize:11, color: isDark?"#8b93a7":"#6b7280", marginBottom:6 }}>
                    {[
                      aiResult.corrections.type  && `Type: ${aiResult.corrections.type}`,
                      aiResult.corrections.color && `Color: ${aiResult.corrections.color}`,
                      aiResult.corrections.name  && `Name: ${aiResult.corrections.name}`,
                    ].filter(Boolean).join(" · ")}
                  </div>
                )}
                {!aiResult.confirmed && (
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={applyAiCorrections}
                      style={{ flex:1, padding:"5px 0", borderRadius:7, border:"none",
                               background:"#ef4444", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                      Apply fix
                    </button>
                    <button onClick={() => setAiResult(null)}
                      style={{ flex:1, padding:"5px 0", borderRadius:7, border:"1px solid #4b5563",
                               background:"transparent", color: isDark?"#8b93a7":"#6b7280",
                               fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
            {aiResult?.error && (
              <div style={{ marginTop:6, fontSize:11, color:"#ef4444" }}>Error: {aiResult.error}</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleSave}
            style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none",
                     background:"#3b82f6", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            Save
          </button>
          <button onClick={handleDelete}
            style={{ flex:1, padding:"9px 0", borderRadius:9, border:"none",
                     background:"#ef4444", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
