import React, { useState } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";

const CATEGORIES = ["shirt", "pants", "shoes", "jacket", "sweater"];
const COLORS = ["navy", "black", "gray", "white", "brown", "olive", "tan", "beige"];

export default function GarmentEditor({ garment, onClose }) {
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const removeGarment = useWardrobeStore(s => s.removeGarment);
  const garments = useWardrobeStore(s => s.garments);
  const watches = useWatchStore(s => s.watches);
  const history = useHistoryStore(s => s.entries);

  const [name, setName] = useState(garment.name);
  const [category, setCategory] = useState(garment.type ?? garment.category ?? "shirt");
  const [color, setColor] = useState(garment.color ?? "gray");
  const [formality, setFormality] = useState(garment.formality ?? 5);

  function handleSave() {
    updateGarment(garment.id, {
      name,
      type: category,
      category,
      color,
      formality,
      needsReview: false,
    });
    setCachedState({ watches, garments, history }).catch(() => {});
    onClose();
  }

  function handleDelete() {
    removeGarment(garment.id);
    setCachedState({ watches, garments: garments.filter(g => g.id !== garment.id), history }).catch(() => {});
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: "#171a21", borderRadius: 16, padding: "24px 28px",
        border: "1px solid #2b3140", width: 360, maxWidth: "90vw",
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Edit Garment</h3>

        {garment.thumbnail && (
          <img src={garment.thumbnail} alt={garment.name}
            style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10, marginBottom: 14 }} />
        )}

        <label style={labelStyle}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

        <label style={labelStyle}>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={labelStyle}>Color</label>
        <select value={color} onChange={e => setColor(e.target.value)} style={inputStyle}>
          {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={labelStyle}>Formality ({formality}/10)</label>
        <input type="range" min={1} max={10} value={formality}
          onChange={e => setFormality(Number(e.target.value))}
          style={{ width: "100%", marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} style={{ ...btnStyle, background: "#3b82f6", flex: 1 }}>Save</button>
          <button onClick={handleDelete} style={{ ...btnStyle, background: "#ef4444", flex: 1 }}>Delete</button>
          <button onClick={onClose} style={{ ...btnStyle, background: "#374151", flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#8b93a7", marginBottom: 4, marginTop: 10 };
const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid #2b3140", background: "#0f131a", color: "#e2e8f0",
  fontSize: 13, marginBottom: 4, boxSizing: "border-box",
};
const btnStyle = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
