/**
 * ImportDebugConsole — collapsible live log of the classifier pipeline.
 * Receives log entries via props; renders inline below the import buttons.
 */
import { useState } from "react";

const STEP_ICON = {
  "start":          "📂",
  "person-detect":  "🙅",
  "vision":         "🔍",
  "vision-result":  "✅",
  "vision-error":   "⚠️",
  "done":           "💾",
};
const STEP_COLOR = {
  "vision-error":  "#f87171",
  "person-detect": "#fb923c",
  "vision":        "#60a5fa",
  "vision-result": "#34d399",
  "done":          "#a78bfa",
};

export default function ImportDebugConsole({ entries, isDark, busy }) {
  const [open, setOpen] = useState(true);

  if (!entries.length && !busy) return null;

  const bg      = isDark ? "#0d1117" : "#f0f4f8";
  const border  = isDark ? "#1e2a3a" : "#cbd5e1";
  const subText = isDark ? "#8b93a7" : "#6b7280";
  const defText = isDark ? "#94a3b8" : "#374151";

  // Group by file: each "start" entry begins a new group
  const groups = [];
  for (const e of entries) {
    if (e.step === "start") {
      groups.push({ filename: e.msg, logs: [e] });
    } else if (groups.length) {
      groups[groups.length - 1].logs.push(e);
    }
  }

  return (
    <div style={{
      marginTop: 10,
      borderRadius: 10,
      border: `1px solid ${border}`,
      background: bg,
      overflow: "hidden",
      fontSize: 11,
    }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", width: "100%", alignItems: "center",
          justifyContent: "space-between", padding: "6px 10px",
          background: "none", border: "none", cursor: "pointer",
          borderBottom: open ? `1px solid ${border}` : "none",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 11, color: defText, letterSpacing: 0.5 }}>
          🪲 IMPORT DEBUG
          {busy && <span style={{ marginLeft: 8, color: "#60a5fa" }}>●</span>}
        </span>
        <span style={{ color: subText }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ maxHeight: 260, overflowY: "auto", padding: "6px 0" }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ borderBottom: gi < groups.length - 1 ? `1px solid ${border}` : "none", paddingBottom: 4, marginBottom: 4 }}>
              {/* File header */}
              <div style={{ padding: "2px 10px", fontWeight: 700, color: defText, fontSize: 10.5 }}>
                📄 {g.filename}
              </div>
              {/* Log lines */}
              {g.logs.slice(1).map((e, li) => {
                const icon  = STEP_ICON[e.step] ?? "•";
                const color = STEP_COLOR[e.step] ?? subText;
                const elapsed = e.ts - g.logs[0].ts;
                return (
                  <div key={li} style={{
                    display: "flex", alignItems: "flex-start", gap: 6,
                    padding: "1px 10px 1px 20px",
                  }}>
                    <span style={{ fontSize: 10, minWidth: 14 }}>{icon}</span>
                    <span style={{ color, flex: 1, lineHeight: 1.5 }}>{e.msg}</span>
                    {e.detail && (
                      <span style={{ color: subText, fontSize: 10, maxWidth: 120, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.detail}
                      </span>
                    )}
                    <span style={{ color: subText, fontSize: 9, minWidth: 30, textAlign: "right" }}>
                      {elapsed > 0 ? `+${elapsed}ms` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {busy && groups.length > 0 && (
            <div style={{ padding: "2px 10px 2px 20px", color: "#60a5fa" }}>⏳ processing…</div>
          )}
        </div>
      )}
    </div>
  );
}
