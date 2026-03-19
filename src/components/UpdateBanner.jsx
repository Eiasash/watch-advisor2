/**
 * UpdateBanner — Service worker update detection + one-tap update.
 *
 * Shows a sticky banner when a new app version is waiting to activate.
 * Tapping "Update" sends SKIP_WAITING to the new SW and reloads the page.
 * Also exports a VersionChip component for use in the header/settings.
 *
 * The current build version (__APP_VERSION__ = "YYYY-MM-DD · {hash}") is
 * injected at build time by vite.config.js.
 */

import React, { useState, useEffect } from "react";

// ── SW update detection ───────────────────────────────────────────────────────

function useServiceWorkerUpdate() {
  const [waitingSW, setWaitingSW] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg = null;

    const checkRegistration = (registration) => {
      reg = registration;

      // Already a waiting SW on load (e.g. user didn't reload last time)
      if (registration.waiting) {
        setWaitingSW(registration.waiting);
      }

      // New SW found during session
      registration.addEventListener("updatefound", () => {
        const newSW = registration.installing;
        if (!newSW) return;
        newSW.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            // New SW installed and waiting — old SW still in control
            setWaitingSW(newSW);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(checkRegistration);

    // Poll for updates every 10 minutes
    const interval = setInterval(() => {
      if (reg) reg.update().catch(() => {});
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const applyUpdate = () => {
    if (!waitingSW) {
      window.location.reload();
      return;
    }
    // Tell the new SW to activate immediately
    waitingSW.postMessage({ type: "SKIP_WAITING" });
    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
    // Safety fallback
    setTimeout(() => window.location.reload(), 1500);
  };

  return { hasUpdate: !!waitingSW, applyUpdate };
}

// ── UpdateBanner ──────────────────────────────────────────────────────────────

export default function UpdateBanner({ isDark }) {
  const { hasUpdate, applyUpdate } = useServiceWorkerUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!hasUpdate || dismissed) return null;

  const bg      = isDark ? "#1e3a5f" : "#dbeafe";
  const border  = isDark ? "#2563eb" : "#93c5fd";
  const text    = isDark ? "#93c5fd" : "#1d4ed8";
  const btnBg   = "#2563eb";
  const btnText = "#ffffff";

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 14px",
      background: bg, borderBottom: `1px solid ${border}`,
      fontSize: 13, color: text,
      gap: 8,
    }}>
      <span style={{ fontWeight: 500 }}>
        🔄 New version available
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={applyUpdate}
          style={{
            padding: "5px 12px", borderRadius: 6, border: "none",
            background: btnBg, color: btnText,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.02em",
          }}>
          Update Now
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: "5px 8px", borderRadius: 6, border: `1px solid ${border}`,
            background: "transparent", color: text,
            fontSize: 12, cursor: "pointer",
          }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ── VersionChip — shows current build hash, tapping checks for update ─────────

export function VersionChip({ isDark, style }) {
  const { hasUpdate, applyUpdate } = useServiceWorkerUpdate();

  const handleClick = () => {
    if (hasUpdate) {
      applyUpdate();
    } else {
      // Manually trigger SW update check
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then(reg => reg.update())
          .catch(() => {});
      }
    }
  };

  const hash = (typeof __COMMIT_HASH__ !== "undefined") ? __COMMIT_HASH__ : "dev";

  const bg      = hasUpdate ? (isDark ? "#1e3a5f" : "#dbeafe") : "transparent";
  const color   = hasUpdate ? "#2563eb" : (isDark ? "#374151" : "#9ca3af");
  const border  = hasUpdate ? "1px solid #2563eb" : "none";

  return (
    <span
      onClick={handleClick}
      title={hasUpdate ? "Update available — tap to update" : `Build ${hash} — tap to check for updates`}
      style={{
        fontSize: 11, fontWeight: hasUpdate ? 700 : 400,
        color, background: bg, border, borderRadius: 4,
        padding: hasUpdate ? "2px 6px" : "0",
        cursor: "pointer", letterSpacing: "0.02em",
        userSelect: "none",
        ...style,
      }}>
      {hasUpdate ? `⬆ Update` : `v${hash}`}
    </span>
  );
}
