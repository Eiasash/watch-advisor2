import React, { useEffect, useState } from "react";
import { subscribeSyncState } from "../services/supabaseSync.js";

export default function SyncBar() {
  const [sync, setSync] = useState({ status: "idle", queued: 0 });

  useEffect(() => subscribeSyncState(setSync), []);

  return React.createElement("div", {
    style: {
      marginTop: 16, padding: "10px 12px", borderRadius: 12,
      background: "#0f131a", border: "1px solid #2b3140", fontSize: 13, opacity: 0.85
    }
  }, `Sync: ${sync.status} · Queue: ${sync.queued}`);
}
