import React, { useState } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { pushGarment, deleteGarment, deleteStoragePhoto } from "../services/supabaseSync.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

const CATEGORIES = [
  "shirt","pants","shoes","jacket","sweater",
  "belt","sunglasses","hat","scarf","bag","accessory",
];
const COLORS = [
  "black","white","navy","blue","grey","brown","tan","beige",
  "olive","green","red","burgundy","cream","orange","yellow","purple","pink",
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
  const [angleIdx, setAngleIdx] = useState(0); // 0 = primary photo

  const angles = [garment.thumbnail].concat(garment.photoAngles ?? []).filter(Boolean);

  function handleSave() {
    const updates = { name, type: category, color, formality, brand, notes, needsReview: false };
    updateGarment(garment.id, updates);
    const updated = garments.map(g => g.id === garment.id ? { ...g, ...updates } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    // Push edit to cloud
    pushGarment({ ...garment, ...updates }).catch(() => {});
    onClose();
  }

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
      // Resize to thumbnail
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 300 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const thumb = c.toDataURL("image/jpeg", 0.7);
        addAngle(garment.id, thumb);
        const newAngles = (garment.photoAngles ?? []).concat([thumb]);
        const updated = garments.map(g => g.id === garment.id ? { ...g, photoAngles: newAngles } : g);
        setCachedState({ watches, garments: updated, history }).catch(() => {});
        setAngleIdx(angles.length); // focus new angle
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
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} style={{ ...inp, resize:"vertical", marginBottom:14 }}
          placeholder="Pairing notes, fit, condition…" />

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
