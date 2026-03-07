import React, { useState, useEffect } from "react";
import { useThemeStore } from "../stores/themeStore.js";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const { mode } = useThemeStore();
  const isDark = mode === "dark";

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Scroll to top"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 900,
        width: 44, height: 44, borderRadius: "50%",
        background: isDark ? "#3b82f6" : "#2563eb",
        color: "#fff", border: "none", cursor: "pointer",
        fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      &#8593;
    </button>
  );
}
