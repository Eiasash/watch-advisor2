import React, { useState, useCallback, useEffect, useRef } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useWatchStore } from "../stores/watchStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { useThemeStore } from "../stores/themeStore.js";
import { isPushSupported, getSubscriptionStatus, subscribePush, unsubscribePush } from "../services/pushService.js";
import BulkTaggerPanel from "./BulkTaggerPanel.jsx";
import BulkPhotoMatcher from "./BulkPhotoMatcher.jsx";
import DebugConsole from "./DebugConsole.jsx";
import { clearCachedState } from "../services/localCache.js";

function saveBackup(garments, watches, history) {
  const ts = new Date();
  const label = ts.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const data = {
    _backup: true,
    _version: 2,
    _savedAt: ts.toISOString(),
    _counts: { garments: garments.length, history: history.length, watches: watches.length },
    watches,
    garments: garments.map(g => ({ ...g })), // full — includes thumbnail base64, photoAngles, material, etc.
    history,
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wa2-backup-${label}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportData(garments, watches, history) {
  const data = {
    version: 2,
    watches,
    garments: garments.map(g => ({
      id: g.id, name: g.name, type: g.type, color: g.color,
      formality: g.formality, needsReview: g.needsReview,
      hash: g.hash ?? "",
      thumbnail: g.thumbnail ?? null,
      photoAngles: g.photoAngles ?? [],
      originalFilename: g.originalFilename ?? null,
      duplicateOf: g.duplicateOf ?? null,
      excludeFromWardrobe: g.excludeFromWardrobe ?? false,
    })),
    history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `watch-advisor-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(garments) {
  const header = "id,name,type,color,formality,needsReview";
  const rows = garments.map(g =>
    [g.id, `"${(g.name || "").replace(/"/g, '""')}"`, g.type, g.color, g.formality, g.needsReview].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wardrobe-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPanel({ onClose, scrollTo }) {
  const bulkTagRef = useRef(null);

  useEffect(() => {
    if (scrollTo === "bulk-tag" && bulkTagRef.current) {
      setTimeout(() => bulkTagRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, [scrollTo]);
  const garments = useWardrobeStore(s => s.garments) ?? [];
  const watches = useWatchStore(s => s.watches) ?? [];
  const history = useHistoryStore(s => s.entries) ?? [];
  const { mode, toggle } = useThemeStore();
  const isDark = mode === "dark";

  const [supabaseUrl, setSupabaseUrl] = useState(
    () => typeof localStorage !== "undefined" ? localStorage.getItem("wa-supabase-url") || "" : ""
  );
  const [supabaseKey, setSupabaseKey] = useState(
    () => typeof localStorage !== "undefined" ? localStorage.getItem("wa-supabase-key") || "" : ""
  );
  const [saved, setSaved] = useState(false);
  const [backupSaved, setBackupSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState("loading"); // loading|unsupported|unsubscribed|subscribed|denied
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    getSubscriptionStatus().then(setPushStatus).catch(() => setPushStatus("unsupported"));
  }, []);

  const handlePushToggle = useCallback(async () => {
    setPushLoading(true);
    try {
      if (pushStatus === "subscribed") {
        await unsubscribePush();
        setPushStatus("unsubscribed");
      } else {
        const ua = navigator.userAgent;
        const device = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Desktop";
        await subscribePush(`${device} (${new Date().toLocaleDateString()})`);
        setPushStatus("subscribed");
      }
    } catch (e) {
      if (e.message === "Permission denied") setPushStatus("denied");
      console.warn("[push] toggle failed:", e.message);
    }
    setPushLoading(false);
  }, [pushStatus]);

  const handleSaveLogin = useCallback(() => {
    try {
      localStorage.setItem("wa-supabase-url", supabaseUrl);
      localStorage.setItem("wa-supabase-key", supabaseKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("[settings] save failed:", e.message, e);
    }
  }, [supabaseUrl, supabaseKey]);

  const bg = isDark ? "#171a21" : "#ffffff";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const cardBg = isDark ? "#0f131a" : "#f3f4f6";
  const textColor = isDark ? "#e2e8f0" : "#1f2937";
  const mutedColor = isDark ? "#6b7280" : "#6b7280";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: "24px 28px",
        border: `1px solid ${border}`, width: 440, maxWidth: "92vw",
        maxHeight: "85vh", overflow: "auto", color: textColor,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Settings</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: mutedColor, fontSize: 20, cursor: "pointer",
          }}>&times;</button>
        </div>

        {/* Morning Brief Push Notifications */}
        <Section title="Morning Brief" isDark={isDark}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: pushStatus === "subscribed" ? 8 : 0 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>Daily push notification</div>
              <div style={{ fontSize:11, color: isDark ? "#6b7280" : "#9ca3af", marginTop:2 }}>
                {pushStatus === "subscribed" && "\u2713 Active \u2014 6:30am daily"}
                {pushStatus === "unsubscribed" && "Watch + outfit pick sent at 6:30am"}
                {pushStatus === "denied" && "\u26a0 Permission blocked \u2014 check browser settings"}
                {pushStatus === "unsupported" && "Not supported on this browser"}
                {pushStatus === "loading" && "Checking\u2026"}
              </div>
            </div>
            {pushStatus !== "unsupported" && pushStatus !== "denied" && pushStatus !== "loading" && (
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                style={{
                  padding:"6px 14px", borderRadius:8, border:"none", cursor: pushLoading ? "wait" : "pointer",
                  background: pushStatus === "subscribed" ? "#ef4444" : "#8b5cf6",
                  color:"#fff", fontSize:12, fontWeight:700, flexShrink:0, marginLeft:12,
                }}
              >
                {pushLoading ? "\u2026" : pushStatus === "subscribed" ? "Turn off" : "Enable"}
              </button>
            )}
          </div>
          {pushStatus === "subscribed" && (
            <div style={{ fontSize:11, padding:"6px 10px", borderRadius:7,
                          background: isDark?"#0f131a":"#f0fdf4", color: isDark?"#86efac":"#15803d",
                          border:"1px solid #22c55e44" }}>
              ⌚ You'll get today's watch + outfit pick every morning at 6:30am
            </div>
          )}
        </Section>

        {/* Theme */}
        <Section title="Appearance" isDark={isDark}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13 }}>Theme</span>
            <button onClick={toggle} style={{
              padding: "6px 14px", borderRadius: 8, border: `1px solid ${border}`,
              background: cardBg, color: textColor, fontSize: 13, cursor: "pointer",
            }}>
              {isDark ? "\u263E Night" : "\u2600 Day"} &rarr; {isDark ? "\u2600 Day" : "\u263E Night"}
            </button>
          </div>
        </Section>

        {/* Supabase Login */}
        <Section title="Cloud Sync (Supabase)" isDark={isDark}>
          <label style={labelStyle(mutedColor)}>Supabase URL</label>
          <input
            value={supabaseUrl}
            onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
            style={inputStyle(isDark, border)}
          />
          <label style={labelStyle(mutedColor)}>Anon Key</label>
          <input
            value={supabaseKey}
            onChange={e => setSupabaseKey(e.target.value)}
            placeholder="your-anon-key"
            type="password"
            style={inputStyle(isDark, border)}
          />
          <button onClick={handleSaveLogin} style={{
            marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none",
            background: saved ? "#22c55e" : "#3b82f6", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
          }}>
            {saved ? "Saved!" : "Save Credentials"}
          </button>
          <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Credentials are saved to localStorage. Reload the page after saving to connect.
          </div>
        </Section>

        {/* Backup */}
        <Section title="Backup" isDark={isDark}>
          <button
            onClick={() => {
              saveBackup(garments, watches, history);
              setBackupSaved(true);
              setTimeout(() => setBackupSaved(false), 2500);
            }}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 8, border: "none",
              background: backupSaved ? "#22c55e" : (isDark ? "#1e293b" : "#0f172a"),
              color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background 0.2s",
            }}
          >
            {backupSaved ? "\u2713 Saved to Downloads" : "\u2b07 Save Backup"}
          </button>
          <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Full backup — garments, photos, history, watches. {garments.length}g · {history.length} log entries
          </div>
        </Section>

        {/* AI Bulk Tagger */}
        <div ref={bulkTagRef} />
        <Section title="AI Garment Tagger" isDark={isDark}>
          <BulkTaggerPanel isDark={isDark} />
        </Section>

        {/* Bulk Photo Matcher */}
        <Section title="Garment Photos" isDark={isDark}>
          <BulkPhotoMatcher />
        </Section>

        {/* Clear App Data */}
        <Section title="Reset App Data" isDark={isDark}>
          <div style={{ fontSize: 12, color: mutedColor, marginBottom: 8 }}>
            Clears local cache (IDB). Next load will pull fresh data from Supabase.
            Use this if you see stale/duplicate garments.
          </div>
          <button
            onClick={async () => {
              if (!confirm("Clear all local app data? Will reload from Supabase on next boot.")) return;
              try {
                await clearCachedState();
                // Also clear background queue tasks DB
                const dbs = await indexedDB.databases?.() ?? [];
                for (const d of dbs) {
                  if (d.name === "watch-advisor2-tasks") indexedDB.deleteDatabase(d.name);
                }
                window.location.reload();
              } catch (e) {
                alert("Clear failed: " + e.message);
              }
            }}
            style={{
              padding: "10px 16px", borderRadius: 8, border: `1px solid #dc2626`,
              background: isDark ? "#1c1917" : "#fef2f2", color: "#dc2626",
              fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
            }}>
            🗑 Clear Local Cache & Reload
          </button>
          <button
            onClick={async () => {
              try {
                // 1. Nuke all SW caches
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
                // 2. Unregister all service workers
                const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
                await Promise.all(regs.map(r => r.unregister()));
                // 3. Clear IDB
                await clearCachedState();
                const dbs = await indexedDB.databases?.() ?? [];
                for (const d of dbs) {
                  if (d.name) indexedDB.deleteDatabase(d.name);
                }
                // 4. Hard reload (bypass cache)
                window.location.replace(window.location.href.split("?")[0] + "?_t=" + Date.now());
              } catch (e) {
                alert("Force update failed: " + e.message);
                window.location.reload();
              }
            }}
            style={{
              padding: "10px 16px", borderRadius: 8, border: `1px solid #2563eb`,
              background: isDark ? "#0c1f3f" : "#dbeafe", color: "#2563eb",
              fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 8,
            }}>
            🔄 Force Update — Nuke Cache + SW
          </button>
        </Section>

        {/* Export */}
        <Section title="Export Data" isDark={isDark}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => exportData(garments, watches, history)}
              style={exportBtnStyle(isDark, border)}
            >
              Export JSON
            </button>
            <button
              onClick={() => exportCSV(garments)}
              style={exportBtnStyle(isDark, border)}
            >
              Export CSV
            </button>
          </div>
          <div style={{ fontSize: 11, color: mutedColor, marginTop: 6 }}>
            Exports wardrobe, watches, and history data.
          </div>
        </Section>

        {/* Stats */}
        <Section title="Performance Stats" isDark={isDark}>
          <div style={{ fontSize: 12, color: mutedColor, lineHeight: 1.8 }}>
            Garments: {garments.length}<br />
            Active garments: {garments.filter(g => !g.excludeFromWardrobe).length}<br />
            Needs review: {garments.filter(g => g.needsReview).length}<br />
            Watches: {watches.length}<br />
            History entries: {history.length}<br />
            Cache: IndexedDB<br />
            Grid: react-window virtualized
          </div>
        </Section>
        {/* Debug Console */}
        <Section title="🪲 Debug Console" isDark={isDark}>
          <DebugConsole isDark={isDark} />
        </Section>

        {/* Version */}
        <div style={{ textAlign: "center", padding: "10px 0 4px", fontSize: 11, color: isDark ? "#374151" : "#d1d5db" }}>
          Watch Advisor · v{__BUILD_NUMBER__} · {__APP_VERSION__}
        </div>

      </div>
    </div>
  );
}

function Section({ title, isDark, children }) {
  const border = isDark ? "#2b3140" : "#d1d5db";
  return (
    <div style={{
      marginBottom: 18, padding: "12px 14px", borderRadius: 12,
      background: isDark ? "#0f131a" : "#f9fafb", border: `1px solid ${border}`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
        color: isDark ? "#6b7280" : "#9ca3af", marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function labelStyle(c) {
  return { display: "block", fontSize: 12, fontWeight: 600, color: c, marginBottom: 4, marginTop: 8 };
}
function inputStyle(isDark, border) {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: `1px solid ${border}`, background: isDark ? "#171a21" : "#ffffff",
    color: isDark ? "#e2e8f0" : "#1f2937", fontSize: 13, boxSizing: "border-box",
  };
}
function exportBtnStyle(isDark, border) {
  return {
    padding: "8px 16px", borderRadius: 8, border: `1px solid ${border}`,
    background: isDark ? "#171a21" : "#ffffff", color: isDark ? "#e2e8f0" : "#1f2937",
    fontSize: 13, fontWeight: 600, cursor: "pointer", flex: 1,
  };
}
