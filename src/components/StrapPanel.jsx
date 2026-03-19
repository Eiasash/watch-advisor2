import React, { useRef, useState, useCallback, useMemo } from "react";
import { useStrapStore } from "../stores/strapStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { uploadPhoto } from "../services/supabaseSync.js";
import { PENDING_STRAPS } from "../data/watchSeed.js";

const TYPE_COLOR  = { bracelet:"#3b82f6", leather:"#92400e", canvas:"#65a30d", nato:"#0891b2", rubber:"#7c3aed", integrated:"#6b7280" };
const TYPE_LABELS = ["bracelet","integrated","leather","canvas","nato","rubber"];
const COLORS      = ["silver","black","brown","tan","navy","teal","olive","grey","white","beige","burgundy","green","red"];
const SWATCH      = { silver:"#c0c0c8", grey:"#9ca3af", black:"#1f2937", brown:"#78350f", tan:"#d4a574",
                      navy:"#1e3a5f", teal:"#0d9488", olive:"#65730a", white:"#f3f4f6", beige:"#d6cfc0",
                      burgundy:"#6b1d1d", green:"#16a34a", red:"#dc2626" };

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
function StrapModal({ initial = {}, onSave, onClose, isDark }) {
  const [form, setForm] = useState({
    label: initial.label ?? "",
    color: initial.color ?? "brown",
    type: initial.type ?? "leather",
    useCase: initial.useCase ?? "",
  });
  const bg = isDark ? "#1a1f2b" : "#fff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";
  const inp = { background: isDark ? "#0f131a" : "#f9fafb", border: `1px solid ${border}`, borderRadius: 8,
                padding: "7px 10px", color: text, fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: bg, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360,
                    border: `1px solid ${border}`, boxShadow: "0 20px 60px #00000055" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 16 }}>
          {initial.id ? "Edit Strap" : "Add Strap"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Label (e.g. Brown calfskin)" value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={inp} />

          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
            {TYPE_LABELS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>

          <div>
            <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af", marginBottom: 6, fontWeight: 600 }}>COLOR</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  title={c}
                  style={{ width: 24, height: 24, borderRadius: 6, background: SWATCH[c] ?? "#888",
                            border: form.color === c ? "2px solid #3b82f6" : "2px solid transparent",
                            cursor: "pointer", boxShadow: form.color === c ? "0 0 0 2px #3b82f655" : "none" }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: isDark ? "#8b93a7" : "#6b7280", marginTop: 4 }}>Selected: {form.color}</div>
          </div>

          <textarea placeholder="Use case (e.g. Smart casual / brown Eccos)" value={form.useCase}
            onChange={e => setForm(f => ({ ...f, useCase: e.target.value }))}
            rows={2} style={{ ...inp, resize: "none" }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 8,
            border: `1px solid ${border}`, background: "transparent", color: isDark ? "#8b93a7" : "#6b7280",
            fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => form.label.trim() && onSave(form)}
            style={{ flex: 2, padding: "9px 0", borderRadius: 8, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {initial.id ? "Save Changes" : "Add Strap"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Individual Strap Card ─────────────────────────────────────────────────────
function StrapCard({ strap, isActive, onSelect, onPhoto, onWristShot, onEdit, onDelete, isDark }) {
  const border   = isDark ? "#2b3140" : "#d1d5db";
  const bg       = isDark ? "#0f131a" : "#f9fafb";
  const activeBg = isDark ? "#0c1f3f" : "#eff6ff";
  const swatch   = SWATCH[strap.color] ?? "#888";

  return (
    <div onClick={() => onSelect(strap.id)}
      style={{ background: isActive ? activeBg : bg, border: `2px solid ${isActive ? "#3b82f6" : border}`,
               borderRadius: 12, padding: 10, cursor: "pointer", transition: "border-color 0.15s",
               position: "relative" }}>

      {isActive && (
        <div style={{ position: "absolute", top: 6, right: 8, fontSize: 10, fontWeight: 700, color: "#3b82f6",
                      background: isDark ? "#1e3a5f" : "#dbeafe", padding: "1px 6px", borderRadius: 4,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</div>
      )}

      {/* Photo area */}
      <div style={{ width: "100%", height: 80, borderRadius: 8, marginBottom: 8, position: "relative",
                    background: strap.thumbnail ? "transparent" : (isDark ? "#171a21" : "#e5e7eb"), overflow: "hidden" }}>
        {strap.thumbnail ? (
          <img src={strap.thumbnail} alt={strap.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onClick={e => e.stopPropagation()} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ width: 36, height: 10, borderRadius: 3, background: swatch,
                          border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}` }} />
            <div style={{ fontSize: 10, color: isDark ? "#4b5563" : "#9ca3af" }}>No photo</div>
          </div>
        )}
        {strap.wristShot && (
          <div style={{ position: "absolute", bottom: 4, right: 4, width: 26, height: 26,
                        borderRadius: 6, overflow: "hidden", border: "2px solid #3b82f6" }}>
            <img src={strap.wristShot} alt="wrist" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937", marginBottom: 2, lineHeight: 1.3 }}>
        {strap.label}
      </div>
      <div style={{ fontSize: 10, color: TYPE_COLOR[strap.type] ?? "#6b7280", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
        {strap.type}
      </div>
      <div style={{ fontSize: 10, color: isDark ? "#6b7280" : "#9ca3af", lineHeight: 1.35 }}>
        {strap.useCase}
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
        <PhotoBtn label="📷" title="Add photo" onFile={f => onPhoto(strap.id, f)} isDark={isDark} />
        <PhotoBtn label="⌚" title="Wrist shot" onFile={f => onWristShot(strap.id, f)} isDark={isDark} capture="environment" />
        <IconBtn label="✏️" title="Edit strap" onClick={() => onEdit(strap)} isDark={isDark} />
        <IconBtn label="🗑️" title="Delete strap" onClick={() => onDelete(strap.id)} isDark={isDark} color="#ef4444" />
      </div>
    </div>
  );
}

function PhotoBtn({ label, title, onFile, isDark, capture }) {
  const ref = useRef();
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <>
      <button title={title} onClick={() => ref.current?.click()}
        style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: `1px solid ${border}`, background: "transparent",
                 color: isDark ? "#8b93a7" : "#6b7280", fontSize: 13, cursor: "pointer" }}>{label}</button>
      <input ref={ref} type="file" accept="image/*" capture={capture} style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </>
  );
}

function IconBtn({ label, title, onClick, isDark, color }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <button title={title} onClick={onClick}
      style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: `1px solid ${border}`, background: "transparent",
               color: color ?? (isDark ? "#8b93a7" : "#6b7280"), fontSize: 13, cursor: "pointer" }}>{label}</button>
  );
}

// ── Main StrapPanel ──────────────────────────────────────────────────────────
export default function StrapPanel({ watch, isDark: isDarkProp }) {
  const { mode }     = useThemeStore();
  const isDark       = isDarkProp ?? mode === "dark";
  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const setActive    = useStrapStore(s => s.setActiveStrap);
  const addPhoto     = useStrapStore(s => s.addStrapPhoto);
  const addWrist     = useStrapStore(s => s.addWristShot);
  const addStrap     = useStrapStore(s => s.addStrap);
  const updateStrap  = useStrapStore(s => s.updateStrap);
  const deleteStrap  = useStrapStore(s => s.deleteStrap);

  const [modal, setModal]   = useState(null); // null | { mode:"add" } | { mode:"edit", strap }
  const [uploading, setUploading] = useState({});

  const watchStraps = Object.values(straps).filter(s => s.watchId === watch?.id);

  // Pending strap deliveries for this watch — filter out any that have been "delivered" (added to store)
  const pendingForWatch = useMemo(() => {
    if (!watch?.id) return [];
    return PENDING_STRAPS.filter(ps => {
      if (ps.watchId !== watch.id) return false;
      // If a strap with the same label already exists in the store, it was marked delivered
      return !watchStraps.some(s => s.label === ps.label);
    });
  }, [watch?.id, watchStraps]);

  const resizeAndUpload = useCallback(async (strapId, file, kind) => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async () => {
        const img = new Image();
        img.onload = async () => {
          const c = document.createElement("canvas");
          const scale = Math.min(1, 480 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const thumb = c.toDataURL("image/jpeg", 0.82);
          if (kind === "wrist") { addWrist(strapId, thumb); resolve(thumb); return; }
          addPhoto(strapId, thumb);
          setUploading(u => ({ ...u, [strapId]: true }));
          try {
            const url = await uploadPhoto(strapId, thumb, "strap-photo");
            if (url) addPhoto(strapId, thumb, url);
          } catch { /* local only */ }
          setUploading(u => ({ ...u, [strapId]: false }));
          resolve(thumb);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }, [addPhoto, addWrist]);

  const handleSave = useCallback((form) => {
    if (modal?.mode === "add") {
      addStrap(watch.id, form);
    } else if (modal?.mode === "edit") {
      updateStrap(modal.strap.id, form);
    }
    setModal(null);
  }, [modal, watch, addStrap, updateStrap]);

  const handleDelete = useCallback((strapId) => {
    if (!confirm("Delete this strap?")) return;
    deleteStrap(strapId);
  }, [deleteStrap]);

  if (!watch) return null;

  const currentActiveId = activeStrap[watch.id];
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const garments = useWardrobeStore(s => s.garments);
  const [aiStrapLoading, setAiStrapLoading] = useState(false);
  const [aiStrapHint, setAiStrapHint] = useState(null);

  const handleStrapAI = useCallback(async () => {
    if (!watch) return;
    setAiStrapLoading(true); setAiStrapHint(null);
    try {
      const wearable = garments.filter(g =>
        !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type)
        && !g.excludeFromWardrobe
      ).slice(0, 15).map(g => ({ name: g.name, type: g.type, color: g.color }));
      const strapList = watchStraps.map(s => ({
        id: s.id, label: s.label, type: s.type, color: s.color,
        isActive: currentActiveId === s.id,
      }));
      const prompt = `You are a watch strap advisor. Given a watch and wardrobe, recommend the best strap for today.

WATCH: ${watch.brand} ${watch.model} — ${watch.dial} dial — formality ${watch.formality ?? 6}/10

AVAILABLE STRAPS:
${strapList.map(s => `- ${s.label} (${s.type}, ${s.color})${s.isActive ? " [CURRENT]" : ""}`).join("\n")}

WARDROBE CONTEXT (recent pieces):
${wearable.map(g => `- ${g.color} ${g.type}`).join("\n")}

STRAP-SHOE RULE: If strap is leather/alligator/canvas, shoes must match strap color. Metal/rubber = exempt.

Return ONLY valid JSON:
{
  "recommended_label": "exact strap label string",
  "reason": "2 sentences: why this strap works with the dial color, formality, and wardrobe context",
  "shoe_required": "black" | "brown" | null
}`;

      const res = await fetch("/.netlify/functions/ai-audit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setAiStrapHint(data);
      // Auto-select the recommended strap
      if (data.recommended_label) {
        const matched = watchStraps.find(s =>
          s.label.toLowerCase().includes(data.recommended_label.toLowerCase()) ||
          data.recommended_label.toLowerCase().includes(s.label.toLowerCase())
        );
        if (matched) setActive(watch.id, matched.id);
      }
    } catch { /* silent */ }
    setAiStrapLoading(false);
  }, [watch, watchStraps, garments, currentActiveId, setActive]);

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#6b7280" : "#9ca3af",
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Straps — {watchStraps.length}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {watchStraps.length > 0 && (
            <button onClick={handleStrapAI} disabled={aiStrapLoading}
              style={{ padding:"5px 10px", borderRadius:8, border:"1px solid #8b5cf6",
                       background:"transparent", color:"#8b5cf6", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {aiStrapLoading ? "…" : "✦ AI Pick"}
            </button>
          )}
          <button onClick={() => setModal({ mode: "add" })}
            style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#3b82f6",
                     color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + Add strap
          </button>
        </div>
      </div>
      {aiStrapHint && !aiStrapHint.error && (
        <div style={{ marginBottom:10, padding:"8px 12px", borderRadius:9,
                      background:isDark?"#0f131a":"#f5f3ff", borderLeft:"3px solid #8b5cf6",
                      fontSize:12, color:isDark?"#c4b5fd":"#5b21b6", lineHeight:1.6 }}>
          <strong>✦ {aiStrapHint.recommended_label}</strong> — {aiStrapHint.reason}
          {aiStrapHint.shoe_required && (
            <span style={{ marginLeft:8, fontSize:11, padding:"1px 6px", borderRadius:4,
                           background:isDark?"#1e293b":"#f1f5f9", color:"#94a3b8" }}>
              → {aiStrapHint.shoe_required} shoes
            </span>
          )}
        </div>
      )}

      {watchStraps.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: isDark ? "#4b5563" : "#9ca3af", fontSize: 13 }}>
          No straps yet. Add one above.
        </div>
      ) : (
        <>
          <style>{`
            .wa-strap-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:10px; }
            @media (max-width:500px) { .wa-strap-grid { grid-template-columns:repeat(2,1fr); } }
          `}</style>
          <div className="wa-strap-grid">
            {watchStraps.map(strap => (
              <StrapCard key={strap.id} strap={strap}
                isActive={currentActiveId === strap.id}
                onSelect={id => setActive(watch.id, id)}
                onPhoto={(id, f) => resizeAndUpload(id, f, "photo")}
                onWristShot={(id, f) => resizeAndUpload(id, f, "wrist")}
                onEdit={s => setModal({ mode: "edit", strap: s })}
                onDelete={handleDelete}
                isDark={isDark} />
            ))}
          </div>
        </>
      )}

      {currentActiveId && straps[currentActiveId] && (
        <div style={{ marginTop: 10, fontSize: 12, color: isDark ? "#8b93a7" : "#6b7280",
                      padding: "6px 10px", borderRadius: 7, background: isDark ? "#0f131a" : "#f3f4f6",
                      border: `1px solid ${border}` }}>
          <span style={{ color: "#3b82f6", fontWeight: 700 }}>Active:</span>{" "}
          {straps[currentActiveId].label} · {straps[currentActiveId].color} · {straps[currentActiveId].useCase}
        </div>
      )}

      {modal && (
        <StrapModal
          initial={modal.strap ?? {}}
          onSave={handleSave}
          onClose={() => setModal(null)}
          isDark={isDark} />
      )}

      {/* Pending strap deliveries */}
      {pendingForWatch.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase",
                        letterSpacing: "0.07em", marginBottom: 8 }}>
            📦 Pending Delivery ({pendingForWatch.length})
          </div>
          {pendingForWatch.map((ps, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                                   borderRadius: 8, marginBottom: 6,
                                   background: isDark ? "#1a1600" : "#fffbeb",
                                   border: `1px solid ${isDark ? "#78350f44" : "#fbbf2444"}` }}>
              <div style={{ width: 14, height: 14, borderRadius: 4,
                            background: SWATCH[ps.color] ?? "#888", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#fbbf24" : "#92400e" }}>
                  {ps.label}
                </div>
                <div style={{ fontSize: 10, color: isDark ? "#8b93a7" : "#9ca3af" }}>
                  {ps.source} · {ps.lug} · {ps.orderValue}
                </div>
              </div>
              <button
                onClick={() => {
                  // Add strap to this watch via strapStore + remove from pending
                  const newId = addStrap(watch.id, { label: ps.label, color: ps.color, type: ps.type, useCase: `${ps.source} delivery` });
                  if (newId) setActive(watch.id, newId);
                }}
                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid #22c55e",
                         background: "transparent", color: "#22c55e", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                ✓ Delivered
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
