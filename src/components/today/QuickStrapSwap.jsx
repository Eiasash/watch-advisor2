/**
 * QuickStrapSwap — quickly change the active strap on the current watch.
 * Shows available straps as tappable chips. Tap to switch instantly.
 * Shows current active strap highlighted.
 */
import React, { useState } from "react";
import { useStrapStore } from "../../stores/strapStore.js";

const STRAP_TYPES = ['leather','bracelet','nato','canvas','rubber','suede'];

const TYPE_EMOJI = { leather: "🔗", bracelet: "⌚", canvas: "🎽", nato: "🎽", rubber: "🏊", suede: "🦌" };

export default function QuickStrapSwap({ watchId, isDark }) {
  const allStraps = useStrapStore(s => s.getStrapsForWatch(watchId));
  const activeStrapObj = useStrapStore(s => s.getActiveStrapObj?.(watchId));
  const setActive = useStrapStore(s => s.setActiveStrap);
  const incrementWear = useStrapStore(s => s.incrementWearCount);
  const [justSwapped, setJustSwapped] = useState(null);
  const addStrap = useStrapStore(s => s.addStrap);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ label: '', color: '', type: 'leather', useCase: '' });

  if (!allStraps.length || allStraps.length <= 1) return null;

  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const muted = isDark ? "#6b7280" : "#9ca3af";
  const accent = "#8b5cf6";

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 6 }}>
        Quick Strap Swap
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {allStraps.map(s => {
          const isActive = s.id === activeStrapObj?.id;
          const wasSwapped = justSwapped === s.id;
          const emoji = TYPE_EMOJI[s.type?.toLowerCase()] ?? "🔗";
          return (
            <button key={s.id}
              onClick={() => {
                if (!isActive) {
                  setActive(watchId, s.id);
                  incrementWear(s.id);
                  setJustSwapped(s.id);
                  setTimeout(() => setJustSwapped(null), 2000);
                }
              }}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                cursor: isActive ? "default" : "pointer",
                border: `1px solid ${isActive ? accent : border}`,
                background: isActive ? `${accent}18` : wasSwapped ? "#22c55e18" : "transparent",
                color: isActive ? accent : wasSwapped ? "#22c55e" : text,
                transition: "all 0.2s",
              }}
            >
              {emoji} {s.label?.slice(0, 18) ?? s.id}
              {isActive && " ●"}
              {wasSwapped && " ✓"}
            </button>
          );
        })}
      </div>

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} style={{
          marginTop: 6, fontSize: 10, padding: '3px 8px', borderRadius: 6,
          border: `1px dashed ${border}`, background: 'transparent',
          color: muted, cursor: 'pointer',
        }}>+ Add strap</button>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input placeholder="Label (e.g. Brown leather)" value={addForm.label}
            onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6,
              border: `1px solid ${border}`, background: 'transparent', color: text, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            <input placeholder="Color" value={addForm.color}
              onChange={e => setAddForm(f => ({ ...f, color: e.target.value }))}
              style={{ flex: 1, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                border: `1px solid ${border}`, background: 'transparent', color: text, outline: 'none' }} />
            <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
              style={{ fontSize: 11, padding: '4px', borderRadius: 6,
                border: `1px solid ${border}`, background: 'transparent', color: text }}>
              {STRAP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <input placeholder="Use case (optional)" value={addForm.useCase}
            onChange={e => setAddForm(f => ({ ...f, useCase: e.target.value }))}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6,
              border: `1px solid ${border}`, background: 'transparent', color: text, outline: 'none' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <button onClick={() => {
              if (!addForm.label.trim()) return;
              const id = addStrap(watchId, {
                label: addForm.label.trim(),
                color: addForm.color.trim() || 'unknown',
                type: addForm.type,
                useCase: addForm.useCase.trim(),
              });
              if (id) setActive(watchId, id);
              setAddForm({ label: '', color: '', type: 'leather', useCase: '' });
              setShowAdd(false);
            }} style={{ flex: 1, fontSize: 11, padding: '5px', borderRadius: 6,
              border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Save</button>
            <button onClick={() => setShowAdd(false)}
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${border}`, background: 'transparent', color: muted, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
