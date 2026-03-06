import React, { useEffect, useState } from "react";
import { subscribeSyncState } from "../services/supabaseSync.js";

const STATUS_COLOR = {
  idle:    "#4b5563",
  pulling: "#3b82f6",
  pushing: "#f97316",
  error:   "#ef4444",
};

export default function SyncBar() {
  const [sync, setSync] = useState({ status: "idle", queued: 0 });

  useEffect(() => subscribeSyncState(setSync), []);

  const color = STATUS_COLOR[sync.status] ?? "#4b5563";

  return (
    <div style={{
      marginTop: 16, padding: "8px 14px", borderRadius: 10,
      background: "#0f131a", border: "1px solid #2b3140",
      fontSize: 12, color,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: color, display: "inline-block", flexShrink: 0,
      }} />
      Sync: {sync.status}
      {sync.queued > 0 && <span style={{ color: "#6b7280", marginLeft: 6 }}>· {sync.queued} queued</span>}
    </div>
  );
}
