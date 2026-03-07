import React, { useEffect, useState, useCallback } from "react";
import { subscribeSyncState, pullCloudState } from "../services/supabaseSync.js";
import { subscribeQueue } from "../services/backgroundQueue.js";
import { useThemeStore } from "../stores/themeStore.js";

const STATUS_CONFIG = {
  idle:          { color: "#22c55e", label: "Connected", icon: "\u2713" },
  "local-only":  { color: "#f59e0b", label: "Local only \u2014 configure Supabase in Settings to sync", icon: "\u26A0" },
  pulling:       { color: "#3b82f6", label: "Syncing...", icon: "\u21BB" },
  pushing:       { color: "#f97316", label: "Pushing...", icon: "\u21A5" },
  error:         { color: "#ef4444", label: "Sync error", icon: "\u2717" },
};

export default function SyncBar() {
  const [sync, setSync] = useState({ status: "idle", queued: 0 });
  const [bgQueue, setBgQueue] = useState({ pending: 0, running: 0 });
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  useEffect(() => subscribeSyncState(setSync), []);
  useEffect(() => subscribeQueue(setBgQueue), []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const config = STATUS_CONFIG[sync.status] ?? STATUS_CONFIG.idle;

  const handleRetry = useCallback(() => {
    pullCloudState().catch(() => {});
  }, []);

  return (
    <div style={{
      marginTop: 16, padding: "8px 14px", borderRadius: 10,
      background: isDark ? "#0f131a" : "#f3f4f6",
      border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
      fontSize: 12, color: config.color,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: online ? config.color : "#ef4444",
        display: "inline-block", flexShrink: 0,
      }} />
      {!online ? (
        <span style={{ color: "#ef4444" }}>{"\u2717"} Offline</span>
      ) : (
        <span>{config.icon} {config.label}</span>
      )}
      {sync.queued > 0 && (
        <span style={{ color: isDark ? "#6b7280" : "#9ca3af", marginLeft: 6 }}>
          &middot; {sync.queued} queued
        </span>
      )}
      {(bgQueue.pending > 0 || bgQueue.running > 0) && (
        <span style={{ color: "#3b82f6", marginLeft: 6 }}>
          &middot; {bgQueue.pending + bgQueue.running} background task{bgQueue.pending + bgQueue.running !== 1 ? "s" : ""}
        </span>
      )}
      {(sync.status === "error" || sync.status === "local-only") && online && (
        <button
          onClick={handleRetry}
          style={{
            marginLeft: "auto", padding: "2px 8px", borderRadius: 4,
            border: `1px solid ${config.color}40`, background: "transparent",
            color: config.color, fontSize: 11, cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
