import React, { useRef, useState, useCallback } from "react";
import { useStrapStore } from "../stores/strapStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { uploadPhoto } from "../services/supabaseSync.js";

const TYPE_COLOR = {
  bracelet: "#3b82f6",
  leather:  "#92400e",
  canvas:   "#65a30d",
  nato:     "#0891b2",
  rubber:   "#7c3aed",
};

const STRAP_COLOR_SWATCH = {
  silver: "#c0c0c8", grey: "#9ca3af", black: "#1f2937", brown: "#78350f",
  tan: "#d4a574", navy: "#1e3a5f", teal: "#0d9488", olive: "#65730a",
  white: "#f3f4f6", beige: "#d6cfc0",
};

function StrapCard({ strap, isActive, onSelect, onPhoto, onWristShot, isDark }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  const bg = isDark ? "#0f131a" : "#f9fafb";
  const activeBg = isDark ? "#0c1f3f" : "#eff6ff";
  const activeBorder = "#3b82f6";
  const swatch = STRAP_COLOR_SWATCH[strap.color] ?? "#888";

  return (
    <div
      onClick={() => onSelect(strap.id)}
      style={{
        background: isActive ? activeBg : bg,
        border: `2px solid ${isActive ? activeBorder : border}`,
        borderRadius: 12, padding: 10, cursor: "pointer",
        transition: "border-color 0.15s",
        position: "relative",
      }}
    >
      {/* Active badge */}
      {isActive && (
        <div style={{
          position: "absolute", top: 6, right: 8,
          fontSize: 10, fontWeight: 700, color: "#3b82f6",
          background: isDark ? "#1e3a5f" : "#dbeafe",
          padding: "1px 6px", borderRadius: 4,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>Active</div>
      )}

      {/* Photo area */}
      <div style={{
        width: "100%", height: 90, borderRadius: 8,
        background: strap.thumbnail ? "transparent" : (isDark ? "#171a21" : "#e5e7eb"),
        overflow: "hidden", marginBottom: 8, position: "relative",
      }}>
        {strap.thumbnail ? (
          <img
            src={strap.thumbnail}
            alt={strap.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <div style={{
              width: 32, height: 10, borderRadius: 3,
              background: swatch, border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
            }} />
            <div style={{ fontSize: 11, color: isDark ? "#4b5563" : "#9ca3af" }}>No photo</div>
          </div>
        )}

        {/* Wrist shot overlay badge */}
        {strap.wristShot && (
          <div
            style={{
              position: "absolute", bottom: 4, right: 4, width: 28, height: 28,
              borderRadius: 6, overflow: "hidden", border: "2px solid #3b82f6",
              cursor: "pointer",
            }}
            onClick={e => { e.stopPropagation(); /* lightbox TODO */ }}
          >
            <img src={strap.wristShot} alt="wrist" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937", marginBottom: 2 }}>
        {strap.label}
      </div>
      <div style={{ fontSize: 10, color: TYPE_COLOR[strap.type] ?? "#6b7280", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {strap.type}
      </div>
      <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af", lineHeight: 1.4 }}>
        {strap.useCase}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
        <PhotoButton label="📷 Photo" onFile={f => onPhoto(strap.id, f)} isDark={isDark} />
        <PhotoButton label="⌚ Wrist" onFile={f => onWristShot(strap.id, f)} isDark={isDark} capture="environment" />
      </div>
    </div>
  );
}

function PhotoButton({ label, onFile, isDark, capture }) {
  const ref = useRef();
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        style={{
          flex: 1, padding: "5px 0", borderRadius: 6, border: `1px solid ${border}`,
          background: "transparent", color: isDark ? "#8b93a7" : "#6b7280",
          fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}
      >
        {label}
      </button>
      <input
        ref={ref} type="file" accept="image/*"
        capture={capture}
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
    </>
  );
}

export default function StrapPanel({ watch, isDark: isDarkProp }) {
  const { mode } = useThemeStore();
  const isDark = isDarkProp ?? mode === "dark";

  const straps       = useStrapStore(s => s.straps);
  const activeStrap  = useStrapStore(s => s.activeStrap);
  const setActive    = useStrapStore(s => s.setActiveStrap);
  const addPhoto     = useStrapStore(s => s.addStrapPhoto);
  const addWrist     = useStrapStore(s => s.addWristShot);

  const [uploading, setUploading] = useState({});

  const watchStraps = Object.values(straps).filter(s => s.watchId === watch?.id);

  const handlePhoto = useCallback(async (strapId, file) => {
    // Instant preview
    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const thumb = c.toDataURL("image/jpeg", 0.8);
        addPhoto(strapId, thumb);

        // Upload to Storage
        setUploading(u => ({ ...u, [strapId]: true }));
        try {
          const url = await uploadPhoto(strapId, thumb, "strap-photo");
          if (url) addPhoto(strapId, thumb, url);
        } catch { /* local only */ }
        setUploading(u => ({ ...u, [strapId]: false }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }, [addPhoto]);

  const handleWristShot = useCallback((strapId, file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        addWrist(strapId, c.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }, [addWrist]);

  if (!watch || watchStraps.length === 0) return null;

  const currentActiveId = activeStrap[watch.id];
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{
      marginTop: 14, paddingTop: 14,
      borderTop: `1px solid ${border}`,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: isDark ? "#6b7280" : "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
      }}>
        Strap Options — {watchStraps.length} available
      </div>

      <style>{`
        .wa-strap-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 10px;
        }
        @media (max-width: 500px) {
          .wa-strap-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="wa-strap-grid">
        {watchStraps.map(strap => (
          <StrapCard
            key={strap.id}
            strap={strap}
            isActive={currentActiveId === strap.id}
            onSelect={id => setActive(watch.id, id)}
            onPhoto={handlePhoto}
            onWristShot={handleWristShot}
            isDark={isDark}
          />
        ))}
      </div>

      {/* Active strap summary */}
      {currentActiveId && straps[currentActiveId] && (
        <div style={{
          marginTop: 10, fontSize: 12, color: isDark ? "#8b93a7" : "#6b7280",
          padding: "6px 10px", borderRadius: 7,
          background: isDark ? "#0f131a" : "#f3f4f6",
          border: `1px solid ${border}`,
        }}>
          <span style={{ color: "#3b82f6", fontWeight: 700 }}>Active:</span>{" "}
          {straps[currentActiveId].label} · {straps[currentActiveId].color} · {straps[currentActiveId].useCase}
        </div>
      )}
    </div>
  );
}
