import React from "react";

export default function Header() {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20, paddingBottom: 16,
      borderBottom: "1px solid #2b3140",
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          watch-advisor
        </h1>
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
          Watch-first outfit planner · 13 genuine · 10 replica
        </div>
      </div>
      <div style={{
        fontSize: 12, color: "#4b5563",
        background: "#0f131a", border: "1px solid #2b3140",
        borderRadius: 8, padding: "6px 12px",
      }}>
        v2
      </div>
    </div>
  );
}
