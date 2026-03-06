import React, { useState } from "react";
import { runPhotoImport } from "../features/wardrobe/photoImport.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { setCachedState } from "../services/localCache.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";

export default function ImportPanel() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const addGarment = useWardrobeStore(s => s.addGarment);
  const garments   = useWardrobeStore(s => s.garments);
  const watches    = useWatchStore(s => s.watches);
  const history    = useHistoryStore(s => s.entries);

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });

    const imported = [];
    for (let i = 0; i < files.length; i++) {
      const garment = await runPhotoImport(files[i]);
      addGarment(garment);
      imported.push(garment);
      setProgress({ done: i + 1, total: files.length });
    }

    // Persist to cache after all done
    const latest = [...garments, ...imported];
    setCachedState({ watches, garments: latest, history }).catch(() => {});

    setBusy(false);
    setProgress({ done: 0, total: 0 });
    e.target.value = "";
  }

  return (
    <div style={{
      padding: "16px 18px", borderRadius: 16,
      background: "#171a21", border: "1px solid #2b3140",
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15, fontWeight: 700 }}>Import Garments</h3>

      <label style={{
        display: "block",
        padding: "28px 16px",
        borderRadius: 12,
        border: "2px dashed #2b3140",
        textAlign: "center",
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition: "border-color 0.2s",
      }}>
        <input
          type="file"
          multiple
          accept="image/*"
          disabled={busy}
          onChange={handleFiles}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#a1a9b8" }}>
          {busy ? `Importing ${progress.done}/${progress.total}…` : "Drop or click to import"}
        </div>
        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>
          Thumbnails generated in background
        </div>
      </label>

      <div style={{ fontSize: 12, color: "#4b5563", marginTop: 12, lineHeight: 1.5 }}>
        Name files with hints for best auto-tagging:
        <br /><span style={{ color: "#6b7280" }}>shirt_navy.jpg, pants_khaki.jpg, shoes_brown.jpg</span>
      </div>
    </div>
  );
}
