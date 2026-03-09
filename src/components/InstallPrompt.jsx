import { useState, useEffect } from "react";

/**
 * PWA install prompt — shown once per session when browser fires
 * beforeinstallprompt. Dismissed state persisted to localStorage.
 */
export default function InstallPrompt({ isDark }) {
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed or user dismissed permanently
    if (localStorage.getItem("wa2-install-dismissed") === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = e => {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !prompt) return null;

  const bg     = isDark ? "#1a1f2b" : "#ffffff";
  const border = isDark ? "#2b3140" : "#e5e7eb";
  const text   = isDark ? "#e2e8f0" : "#1f2937";
  const sub    = isDark ? "#8b93a7" : "#6b7280";

  const install = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setPrompt(null);
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("wa2-install-dismissed", "1");
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
      width: "calc(100% - 32px)",
      maxWidth: 400,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 16,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: "0 8px 32px #00000040",
    }}>
      <img src="/icon-96.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Add to Home Screen</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>Install Watch Advisor for offline access</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button onClick={dismiss} style={{
          padding: "7px 12px", borderRadius: 8, border: `1px solid ${border}`,
          background: "transparent", color: sub, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>Later</button>
        <button onClick={install} style={{
          padding: "7px 14px", borderRadius: 8, border: "none",
          background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>Install</button>
      </div>
    </div>
  );
}
