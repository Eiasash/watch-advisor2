import React, { useState, useRef } from "react";
import { runClassifierPipeline } from "../classifier/pipeline.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";

export default function ImportPanel() {
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const addGarment  = useWardrobeStore(s => s.addGarment);
  const garments    = useWardrobeStore(s => s.garments);
  const watches     = useWatchStore(s => s.watches);
  const history     = useHistoryStore(s => s.entries);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const garmentsRef = useRef(garments);
  garmentsRef.current = garments;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    console.log("[ImportPanel] handler fired, files:", files.length);
    if (!files.length) return;

    setBusy(true);
    setProgress({ done: 0, total: files.length, errors: [] });

    const imported = [];
    const errors   = [];

    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length, errors });
      console.log("[ImportPanel] processing file", i + 1, "/", files.length, ":", files[i].name);

      try {
        const garment = await runClassifierPipeline(files[i], garmentsRef.current);
        addGarment(garment);
        console.log("[ImportPanel] garment added:", garment.id, garment.type, garment.color);
        imported.push(garment);
      } catch (err) {
        console.error("[ImportPanel] file failed:", files[i].name, err?.message ?? err);
        errors.push(files[i].name);
      }

      setProgress({ done: i + 1, total: files.length, errors: [...errors] });
    }

    console.log("[ImportPanel] batch done. imported:", imported.length, "errors:", errors.length);
    const latest = [...garmentsRef.current];
    setCachedState({ watches, garments: latest, history }).catch(() => {});

    setBusy(false);
    if (errors.length === 0) setProgress({ done: 0, total: 0, errors: [] });
    e.target.value = "";
  }

  const hasErrors = progress.errors.length > 0;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 16,
      background: isDark ? "#171a21" : "#ffffff",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
        Import Garments
      </h3>

      <label style={{
        display: "block", padding: "28px 16px", borderRadius: 12,
        border: `2px dashed ${hasErrors ? "#ef4444" : isDark ? "#2b3140" : "#d1d5db"}`,
        textAlign: "center", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
      }}>
        <input type="file" multiple accept="image/*" disabled={busy} onChange={handleFiles} style={{ display: "none" }} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>&#128248;</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#a1a9b8" : "#4b5563" }}>
          {busy ? `Importing ${progress.done}/${progress.total}\u2026` : hasErrors ? `Done \u2014 ${progress.errors.length} failed` : "Drop or click to import"}
        </div>
        {busy && (
          <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: isDark ? "#2b3140" : "#d1d5db", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: "#3b82f6", width: pct + "%", transition: "width 0.15s" }} />
          </div>
        )}
        {hasErrors && !busy && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>Failed: {progress.errors.join(", ")}</div>}
        {!busy && !hasErrors && <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>Auto-classifies type, color &amp; formality</div>}
      </label>

      <div style={{ fontSize: 12, color: "#4b5563", marginTop: 12, lineHeight: 1.5 }}>
        Name files for best tagging:
        <br /><span style={{ color: "#6b7280" }}>shirt_navy.jpg &middot; pants_khaki.jpg &middot; shoes_brown.jpg</span>
        <br /><span style={{ color: "#6b7280", fontSize: 11 }}>Camera roll photos (IMG_*) auto-named by detected type &amp; color</span>
      </div>
    </div>
  );
}
