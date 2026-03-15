import React from "react";

/**
 * LogButton — primary CTA to log today's outfit.
 * Disabled visually and functionally when watchId is absent.
 *
 * Props:
 *   onLog    — () → void
 *   disabled — boolean
 */
export default function LogButton({ onLog, disabled }) {
  return (
    <button
      onClick={onLog}
      disabled={disabled}
      style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none",
               background: disabled ? "#374151" : "#3b82f6", color: "#fff",
               fontSize: 16, fontWeight: 800,
               cursor: disabled ? "not-allowed" : "pointer" }}>
      Log Today's Outfit ✓
    </button>
  );
}
