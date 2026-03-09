import React, { useState, useCallback, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { pushGarment, deleteGarment, deleteStoragePhoto, uploadAngle } from "../services/supabaseSync.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { useToast } from "./ToastProvider.jsx";

// ── Vocabulary ────────────────────────────────────────────────────────────────

const TYPE_GROUPS = [
  { label: "Tops",       items: ["shirt","polo","tee","flannel","overshirt"] },
  { label: "Knitwear",   items: ["sweater","cardigan","hoodie","crewneck"] },
  { label: "Outerwear",  items: ["jacket","coat","blazer","bomber","vest"] },
  { label: "Bottoms",    items: ["pants","jeans","chinos","shorts","joggers","corduroy"] },
  { label: "Shoes",      items: ["shoes","boots","sneakers","loafers","sandals"] },
  { label: "Accessories",items: ["belt","sunglasses","hat","scarf","bag","accessory"] },
];
// Flat canonical list for saving (normalised)
const ALL_TYPES = TYPE_GROUPS.flatMap(g => g.items);

const COLOR_PALETTE = [
  { name:"beige",       hex:"#f5e6c8", border:true },
  { name:"black",       hex:"#111111" },
  { name:"blue",        hex:"#2563eb" },
  { name:"brown",       hex:"#7c4b2a" },
  { name:"burgundy",    hex:"#6b1d1d" },
  { name:"camel",       hex:"#c19a6b" },
  { name:"charcoal",    hex:"#374151" },
  { name:"cognac",      hex:"#a0522d" },
  { name:"coral",       hex:"#fb7185" },
  { name:"cream",       hex:"#faf7e9", border:true },
  { name:"dark brown",  hex:"#3b1a08" },
  { name:"dark green",  hex:"#14532d" },
  { name:"dark navy",   hex:"#0f172a" },
  { name:"denim",       hex:"#4a6fa5" },
  { name:"gold",        hex:"#b8860b" },
  { name:"green",       hex:"#16a34a" },
  { name:"grey",        hex:"#6b7280" },
  { name:"ivory",       hex:"#fffff0", border:true },
  { name:"khaki",       hex:"#8a8060" },
  { name:"lavender",    hex:"#a78bfa" },
  { name:"light blue",  hex:"#93c5fd" },
  { name:"maroon",      hex:"#7f1d1d" },
  { name:"mint",        hex:"#6ee7b7" },
  { name:"multicolor",  hex:"linear-gradient(135deg,#f43f5e,#3b82f6,#10b981)" },
  { name:"navy",        hex:"#1e3a5f" },
  { name:"olive",       hex:"#6b7c2d" },
  { name:"orange",      hex:"#ea580c" },
  { name:"pink",        hex:"#ec4899" },
  { name:"purple",      hex:"#7c3aed" },
  { name:"red",         hex:"#dc2626" },
  { name:"rust",        hex:"#c2410c" },
  { name:"sage",        hex:"#7d9b76" },
  { name:"sand",        hex:"#d2b48c", border:true },
  { name:"silver",      hex:"#9ca3af" },
  { name:"slate",       hex:"#64748b" },
  { name:"tan",         hex:"#c4a882" },
  { name:"taupe",       hex:"#b5a69e" },
  { name:"teal",        hex:"#0d9488" },
  { name:"white",       hex:"#f9fafb", border:true },
  { name:"wine",        hex:"#7c2d3d" },
  { name:"yellow",      hex:"#ca8a04" },
];

const PATTERNS = [
  "solid","striped","plaid","checked","houndstooth",
  "herringbone","floral","textured","printed","cable knit","ribbed",
];

const SEASONS  = ["spring","summer","autumn","winter","all-season"];
const CONTEXTS = ["casual","smart-casual","clinic","formal","date-night","riviera"];

const FORMALITY_LABELS = {
  1:"Very casual",2:"Casual",3:"Relaxed",4:"Smart casual light",5:"Smart casual",
  6:"Business casual",7:"Business",8:"Smart formal",9:"Formal",10:"Black tie",
};

// Canonical save: map display subtypes back to normalise-compatible values
function canonicalType(t) {
  const map = {
    polo:"shirt", tee:"shirt", flannel:"shirt", overshirt:"jacket",
    cardigan:"sweater", hoodie:"sweater", crewneck:"sweater",
    coat:"jacket", blazer:"jacket", bomber:"jacket", vest:"jacket",
    jeans:"pants", chinos:"pants", shorts:"pants", joggers:"pants", corduroy:"pants",
    boots:"shoes", sneakers:"shoes", loafers:"shoes", sandals:"shoes",
    accessory:"accessory",
  };
  return map[t] ?? t;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em",
                    textTransform:"uppercase", color:"#6b7280", marginBottom:6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ColorSwatch({ c, selected, onClick }) {
  const isGradient = c.hex.startsWith("linear");
  return (
    <button
      title={c.name}
      onClick={() => onClick(c.name)}
      style={{
        width:28, height:28, borderRadius:6, padding:0, border:"none", cursor:"pointer",
        background: c.hex,
        outline: selected ? "2px solid #3b82f6" : c.border ? "1px solid #d1d5db" : "none",
        outlineOffset: selected ? 2 : 0,
        boxShadow: selected ? "0 0 0 1px #fff,0 0 0 3px #3b82f6" : "none",
        flexShrink:0,
        transition:"transform 0.1s",
        transform: selected ? "scale(1.18)" : "scale(1)",
      }}
    />
  );
}

function ChipPicker({ options, value, multi, onChange, isDark }) {
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const toggle = (opt) => {
    if (!multi) { onChange(opt); return; }
    const cur = Array.isArray(value) ? value : [];
    onChange(cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]);
  };
  const isOn = opt => multi ? selected.includes(opt) : selected === opt;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => toggle(opt)} style={{
          padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600,
          border:`1px solid ${isOn(opt) ? "#3b82f6" : (isDark?"#2b3140":"#d1d5db")}`,
          background: isOn(opt) ? "#1d4ed822" : "transparent",
          color: isOn(opt) ? "#3b82f6" : (isDark?"#8b93a7":"#6b7280"),
          cursor:"pointer",
        }}>{opt}</button>
      ))}
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function GarmentEditor({ garment, onClose }) {
  const updateGarment = useWardrobeStore(s => s.updateGarment);
  const removeGarment = useWardrobeStore(s => s.removeGarment);
  const addAngle      = useWardrobeStore(s => s.addAngle);
  const addGarment    = useWardrobeStore(s => s.addGarment);
  const garments      = useWardrobeStore(s => s.garments);
  const watches       = useWatchStore(s => s.watches);
  const history       = useHistoryStore(s => s.entries);
  const { mode }      = useThemeStore();
  const isDark        = mode === "dark";
  const { addToast }  = useToast() ?? {};

  // ── Form state ──────────────────────────────────────────────────────────────
  const [typeRaw,    setTypeRaw]    = useState(garment.type       ?? garment.category ?? "shirt");
  const [color,      setColor]      = useState(garment.color      ?? "grey");
  const [color2,     setColor2]     = useState(garment.accentColor ?? "");
  const [material,   setMaterial]   = useState(garment.material   ?? "");
  const [pattern,    setPattern]    = useState(garment.pattern    ?? "solid");
  const [formality,  setFormality]  = useState(garment.formality  ?? 5);
  const [brand,      setBrand]      = useState(garment.brand      ?? "");
  const [price,      setPrice]      = useState(garment.price      ?? "");
  const [notes,      setNotes]      = useState(garment.notes      ?? "");
  const [seasons,    setSeasons]    = useState(garment.seasons    ?? []);
  const [contexts,   setContexts]   = useState(garment.contexts   ?? []);
  const [angleIdx,   setAngleIdx]   = useState(0);
  const [aiColorAlts, setAiColorAlts] = useState([]); // color alternatives from AI scan

  // Auto-name: compute from params, track if user has manually overridden it
  function buildAutoName(t, c, p, b) {
    const parts = [];
    if (c && c !== "multicolor") parts.push(c.charAt(0).toUpperCase() + c.slice(1));
    if (p && p !== "solid") parts.push(p.charAt(0).toUpperCase() + p.slice(1));
    parts.push(t.charAt(0).toUpperCase() + t.slice(1));
    if (b) parts.push(`(${b})`);
    return parts.join(" ");
  }
  const initAuto = buildAutoName(
    garment.type ?? garment.category ?? "shirt",
    garment.color ?? "grey",
    garment.pattern ?? "solid",
    garment.brand ?? ""
  );
  const [name,         setName]         = useState(garment.name ?? initAuto);
  const [nameManual,   setNameManual]   = useState(
    !!garment.name && garment.name !== initAuto
  );

  // Keep name in sync when params change, unless user has manually edited it
  useEffect(() => {
    if (nameManual) return;
    setName(buildAutoName(typeRaw, color, pattern, brand));
  }, [typeRaw, color, pattern, brand, nameManual]);

  const [aiChecking, setAiChecking] = useState(false);
  const [aiResult,   setAiResult]   = useState(null);
  const [saving,     setSaving]     = useState(false);

  const angles = [garment.thumbnail || garment.photoUrl]
    .concat(garment.photoAngles ?? []).filter(Boolean);

  // ── Wear stats ──────────────────────────────────────────────────────────────
  const wearCount = history.filter(e => (e.garmentIds ?? []).includes(garment.id)).length;
  const cpw = (garment.price && wearCount > 0)
    ? (parseFloat(garment.price) / wearCount).toFixed(0) : null;

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    const updates = {
      name, type: canonicalType(typeRaw), color,
      accentColor: color2 || undefined,
      material: material || undefined,
      pattern, formality,
      brand: brand || undefined,
      price: price ? parseFloat(price) : undefined,
      notes: notes || undefined,
      seasons: seasons.length ? seasons : undefined,
      contexts: contexts.length ? contexts : undefined,
      needsReview: false,
    };
    updateGarment(garment.id, updates);
    const updated = garments.map(g => g.id === garment.id ? { ...g, ...updates } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    pushGarment({ ...garment, ...updates }).catch(() => {});
    setSaving(false);
    onClose();
  }

  // ── AI label check ──────────────────────────────────────────────────────────
  const handleAiCheck = useCallback(async () => {
    const photo = garment.thumbnail || garment.photoUrl;
    if (!photo) return;
    setAiChecking(true); setAiResult(null); setAiColorAlts([]);
    try {
      const res = await fetch("/.netlify/functions/relabel-garment", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          image: photo,
          current: { type: typeRaw, color, name, formality },
          allAngles: (garment.photoAngles ?? []).slice(0, 3),
        }),
      });
      const data = await res.json();
      setAiResult(data);
      if (Array.isArray(data?.corrections?.color_alternatives)) {
        setAiColorAlts(data.corrections.color_alternatives.filter(Boolean));
      } else if (Array.isArray(data?.color_alternatives)) {
        setAiColorAlts(data.color_alternatives.filter(Boolean));
      }
    } catch (e) { setAiResult({ error: e.message }); }
    setAiChecking(false);
  }, [garment, typeRaw, color, name, formality]);

  const applyAi = useCallback(() => {
    if (!aiResult?.corrections) return;
    const c = aiResult.corrections;
    if (c.type)     setTypeRaw(c.type);
    if (c.color)    setColor(c.color);
    if (c.name)     setName(c.name);
    if (c.material) setMaterial(c.material);
    if (c.formality != null) setFormality(c.formality);
    const updates = {
      name: c.name ?? name, type: canonicalType(c.type ?? typeRaw),
      color: c.color ?? color,
      material: c.material ?? (material || undefined),
      formality: c.formality ?? formality, needsReview: false,
    };
    updateGarment(garment.id, updates);
    const updated = garments.map(g => g.id === garment.id ? { ...g, ...updates } : g);
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    pushGarment({ ...garment, ...updates }).catch(() => {});
    setAiResult(null);
  }, [aiResult, name, typeRaw, color, formality, garment, garments, watches, history, updateGarment]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    removeGarment(garment.id);
    setCachedState({ watches, garments: garments.filter(g => g.id !== garment.id), history }).catch(() => {});
    deleteGarment(garment.id).catch(() => {});
    deleteStoragePhoto(garment.id).catch(() => {});
    onClose();
  }

  // ── Split: another item in same photo ───────────────────────────────────────
  function handleSplitPhoto() {
    const newId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newGarment = {
      id: newId,
      name: "New item from same photo",
      type: "shirt",
      category: "shirt",
      color: garment.color ?? "grey",
      formality: garment.formality ?? 5,
      thumbnail: garment.thumbnail ?? null,
      photoUrl: garment.photoUrl ?? null,
      splitFrom: garment.id,
      needsReview: true,
    };
    addGarment(newGarment);
    const updated = [...garments, newGarment];
    setCachedState({ watches, garments: updated, history }).catch(() => {});
    pushGarment(newGarment).catch(() => {});
    addToast?.("New item added — tap to label it", "success");
  }

  // ── Angle upload ────────────────────────────────────────────────────────────
  async function handleAngleUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
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
        addAngle(garment.id, thumb);
        const newAngles = (garment.photoAngles ?? []).concat([thumb]);
        const upd = garments.map(g => g.id === garment.id ? { ...g, photoAngles: newAngles } : g);
        setCachedState({ watches, garments: upd, history }).catch(() => {});
        setAngleIdx(angles.length);
        try {
          const url = await uploadAngle(garment.id, (garment.photoAngles ?? []).length, thumb);
          if (url) pushGarment({ ...garment, photoAngles: [...(garment.photoAngles??[]).filter(u=>!u.startsWith("data:")), url] }).catch(()=>{});
        } catch { /* local only */ }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const bg     = isDark ? "#171a21" : "#fff";
  const panelBg = isDark ? "#0f131a" : "#f3f4f6";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";
  const inp    = { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${border}`,
                   background:panelBg, color:text, fontSize:13, boxSizing:"border-box", fontFamily:"inherit" };

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)",
               display:"flex", alignItems:"flex-end", justifyContent:"center",
               zIndex:1000, padding:"0" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:bg, borderRadius:"20px 20px 0 0", padding:"0 0 env(safe-area-inset-bottom,16px)",
                 border:`1px solid ${border}`, width:"100%", maxWidth:520, maxHeight:"94vh",
                 overflowY:"auto", boxSizing:"border-box" }}>

        {/* Drag handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"10px 0 0" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:isDark?"#2b3140":"#d1d5db" }} />
        </div>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"10px 20px 12px", position:"sticky", top:0, background:bg, zIndex:2,
                      borderBottom:`1px solid ${border}` }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:text }}>{name || "Garment"}</div>
            {wearCount > 0 && (
              <div style={{ fontSize:11, color:sub }}>
                Worn {wearCount}×{cpw ? ` · ₪${cpw}/wear` : ""}
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", color:sub, fontSize:22, cursor:"pointer",
                     lineHeight:1, padding:"4px 8px" }}>✕</button>
        </div>

        <div style={{ padding:"16px 20px 24px" }}>

          {/* Photo strip */}
          {angles.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <img src={angles[angleIdx]} alt={name}
                style={{ width:"100%", height:200, objectFit:"cover", borderRadius:12, display:"block" }} />
              <div style={{ display:"flex", gap:6, marginTop:8, alignItems:"center" }}>
                {angles.map((a, i) => (
                  <button key={i} onClick={() => setAngleIdx(i)} style={{
                    width:40, height:40, borderRadius:8, overflow:"hidden", padding:0, flexShrink:0,
                    border:`2px solid ${i === angleIdx ? "#3b82f6" : border}`, cursor:"pointer",
                  }}>
                    <img src={a} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  </button>
                ))}
                {angles.length < 5 && (
                  <label style={{ width:40, height:40, borderRadius:8, border:`2px dashed ${border}`,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:20, cursor:"pointer", color:sub, flexShrink:0 }}>
                    +
                    <input type="file" accept="image/*" onChange={handleAngleUpload} style={{ display:"none" }} />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Split: multi-item photo */}
          {(garment.thumbnail || garment.photoUrl) && (
            <button onClick={handleSplitPhoto}
              style={{ width:"100%", padding:"8px 0", borderRadius:9, border:`1px dashed ${border}`,
                       background:"transparent", color:sub, fontSize:12, fontWeight:600,
                       cursor:"pointer", marginBottom:14 }}>
              + Another item in this photo
            </button>
          )}

          {/* Name */}
          <Section label="Name">
            <div style={{ position:"relative" }}>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameManual(true); }}
                style={{ ...inp, paddingRight: nameManual ? 70 : 10 }}
                placeholder="e.g. Navy Cable Knit Crewneck"
              />
              {nameManual && (
                <button
                  onClick={() => { setNameManual(false); setName(buildAutoName(typeRaw, color, pattern, brand)); }}
                  title="Reset to auto-generated name"
                  style={{
                    position:"absolute", right:6, top:"50%", transform:"translateY(-50%)",
                    background:"#1d4ed822", border:"1px solid #3b82f644", borderRadius:6,
                    color:"#60a5fa", fontSize:10, fontWeight:700, padding:"3px 7px",
                    cursor:"pointer", whiteSpace:"nowrap",
                  }}>
                  ↺ Auto
                </button>
              )}
            </div>
            {!nameManual && (
              <div style={{ fontSize:10, color: isDark?"#4b5563":"#9ca3af", marginTop:3 }}>
                Auto-generated · type to override
              </div>
            )}
          </Section>

          {/* Type */}
          <Section label="Type">
            {TYPE_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:sub, letterSpacing:"0.06em",
                              textTransform:"uppercase", marginBottom:4 }}>{group.label}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {group.items.map(t => {
                    const on = typeRaw === t;
                    return (
                      <button key={t} onClick={() => setTypeRaw(t)} style={{
                        padding:"5px 11px", borderRadius:20, fontSize:12, fontWeight:600,
                        border:`1px solid ${on ? "#3b82f6" : border}`,
                        background: on ? "#3b82f6" : "transparent",
                        color: on ? "#fff" : (isDark ? "#8b93a7" : "#6b7280"),
                        cursor:"pointer",
                      }}>{t}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Section>

          {/* Primary color */}
          <Section label="Primary Color">
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:6 }}>
              {COLOR_PALETTE.map(c => (
                <ColorSwatch key={c.name} c={c} selected={color === c.name} onClick={setColor} />
              ))}
            </div>
            <div style={{ fontSize:11, color:sub, marginTop:2 }}>Selected: <strong style={{ color:text }}>{color}</strong></div>
            {aiColorAlts.length > 0 && (
              <div style={{ marginTop:8, padding:"8px 10px", borderRadius:8, background: isDark?"#0f131a":"#f5f3ff", border:"1px solid #8b5cf644" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#8b5cf6", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>
                  AI color alternatives
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                  {aiColorAlts.map(alt => {
                    const c = COLOR_PALETTE.find(x => x.name === alt);
                    return (
                      <button key={alt} onClick={() => setColor(alt)}
                        title={alt}
                        style={{
                          display:"flex", alignItems:"center", gap:5,
                          padding:"3px 8px 3px 5px", borderRadius:6, cursor:"pointer",
                          border: color===alt ? "2px solid #3b82f6" : "1px solid #4b5563",
                          background: color===alt ? (isDark?"#0c1f3f":"#eff6ff") : "transparent",
                          fontSize:11, color:text, fontWeight: color===alt ? 700 : 400,
                        }}>
                        {c && <span style={{ width:14, height:14, borderRadius:3, background:c.hex, flexShrink:0, border: c.border?"1px solid #d1d5db":"none" }} />}
                        {alt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* Accent color */}
          <Section label="Accent / Secondary Color (optional)">
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:6 }}>
              <button onClick={() => setColor2("")} style={{
                width:28, height:28, borderRadius:6, border:`1px solid ${border}`,
                background:"transparent", fontSize:12, cursor:"pointer",
                outline: !color2 ? "2px solid #3b82f6" : "none", outlineOffset:2,
              }}>—</button>
              {COLOR_PALETTE.map(c => (
                <ColorSwatch key={c.name} c={c} selected={color2 === c.name} onClick={setColor2} />
              ))}
            </div>
            {color2 && <div style={{ fontSize:11, color:sub }}>Accent: <strong style={{ color:text }}>{color2}</strong></div>}
          </Section>

          {/* Material */}
          <Section label="Material / Fabric">
            <ChipPicker
              options={["wool","cotton","linen","denim","leather","suede","synthetic","cashmere","knit","corduroy","tweed","flannel","canvas","rubber","mesh"]}
              value={material} multi={false} onChange={setMaterial} isDark={isDark}
            />
            {material && <div style={{ fontSize:11, color:sub, marginTop:4 }}>Material: <strong style={{ color:text }}>{material}</strong></div>}
          </Section>

          {/* Pattern */}
          <Section label="Pattern">
            <ChipPicker options={PATTERNS} value={pattern} multi={false} onChange={setPattern} isDark={isDark} />
          </Section>

          {/* Formality */}
          <Section label={`Formality ${formality}/10 — ${FORMALITY_LABELS[formality]}`}>
            <input type="range" min={1} max={10} value={formality}
              onChange={e => setFormality(Number(e.target.value))}
              style={{ width:"100%", accentColor:"#3b82f6" }} />
          </Section>

          {/* Brand + Price */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em",
                            textTransform:"uppercase", color:sub, marginBottom:4 }}>Brand</div>
              <input value={brand} onChange={e => setBrand(e.target.value)} style={{ ...inp }}
                placeholder="Gant, Massimo…" />
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.08em",
                            textTransform:"uppercase", color:sub, marginBottom:4 }}>Price paid ₪</div>
              <input type="number" min="0" step="1" value={price}
                onChange={e => setPrice(e.target.value)} style={{ ...inp }}
                placeholder="For cost-per-wear" />
            </div>
          </div>

          {/* Seasons */}
          <Section label="Season">
            <ChipPicker options={SEASONS} value={seasons} multi={true} onChange={setSeasons} isDark={isDark} />
          </Section>

          {/* Contexts */}
          <Section label="Best For">
            <ChipPicker options={CONTEXTS} value={contexts} multi={true} onChange={setContexts} isDark={isDark} />
          </Section>

          {/* Notes */}
          <Section label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} style={{ ...inp, resize:"vertical" }}
              placeholder="Fit, condition, pairing ideas…" />
          </Section>

          {/* Last worn */}
          {garment.lastWorn && (() => {
            const d = Math.floor((Date.now() - new Date(garment.lastWorn).getTime()) / 864e5);
            const col = d <= 3 ? "#4ade80" : d <= 14 ? "#f59e0b" : "#9ca3af";
            return (
              <div style={{ fontSize:11, color:col, marginBottom:14 }}>
                Last worn: {garment.lastWorn}
                {" "}({d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`})
              </div>
            );
          })()}

          {/* AI check */}
          {(garment.thumbnail || garment.photoUrl) && (
            <div style={{ marginBottom:14 }}>
              <button onClick={handleAiCheck} disabled={aiChecking}
                style={{ width:"100%", padding:"9px 0", borderRadius:9, border:`1px solid ${border}`,
                         background:"transparent", color:isDark?"#e2e8f0":"#374151",
                         fontSize:13, fontWeight:600, cursor:aiChecking?"wait":"pointer" }}>
                {aiChecking ? "🔍 Checking…" : "🔍 AI verify label"}
              </button>
              {aiResult && !aiResult.error && (
                <div style={{ marginTop:8, padding:"10px 12px", borderRadius:9,
                              background: aiResult.confirmed ? (isDark?"#0a1f0a":"#f0fdf4") : (isDark?"#1f0a0a":"#fff7f7"),
                              border:`1px solid ${aiResult.confirmed?"#16a34a":"#ef4444"}` }}>
                  <div style={{ fontSize:12, fontWeight:700,
                                color:aiResult.confirmed?"#16a34a":"#ef4444", marginBottom:4 }}>
                    {aiResult.confirmed ? "✓ Label correct" : "⚠ Possible mislabel"}
                    <span style={{ fontWeight:400, color:sub, marginLeft:6 }}>
                      {Math.round((aiResult.confidence ?? 0)*100)}%
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:text, marginBottom:6 }}>{aiResult.reason}</div>
                  {!aiResult.confirmed && aiResult.corrections && (
                    <div style={{ fontSize:11, color:sub, marginBottom:6 }}>
                      {[aiResult.corrections.type&&`Type: ${aiResult.corrections.type}`,
                        aiResult.corrections.color&&`Color: ${aiResult.corrections.color}`,
                        aiResult.corrections.name&&`Name: ${aiResult.corrections.name}`]
                        .filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {!aiResult.confirmed && (
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={applyAi} style={{ flex:1, padding:"5px 0", borderRadius:7,
                        border:"none", background:"#ef4444", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        Apply fix
                      </button>
                      <button onClick={() => setAiResult(null)} style={{ flex:1, padding:"5px 0", borderRadius:7,
                        border:`1px solid ${border}`, background:"transparent", color:sub, fontSize:11, cursor:"pointer" }}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
              {aiResult?.error && <div style={{ marginTop:6, fontSize:11, color:"#ef4444" }}>Error: {aiResult.error}</div>}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex:2, padding:"12px 0", borderRadius:10, border:"none",
                       background: saving ? "#1d4ed8" : "#3b82f6",
                       color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleDelete}
              style={{ flex:1, padding:"12px 0", borderRadius:10, border:"none",
                       background:"#450a0a", color:"#fca5a5", fontWeight:700, fontSize:14, cursor:"pointer" }}>
              Delete
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
