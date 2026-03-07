import React, { useState, useEffect, useCallback } from "react";
import { useBootstrap } from "./bootstrap.js";
import { useThemeStore } from "../stores/themeStore.js";
import Header from "../components/Header.jsx";
import WatchDashboard from "../components/WatchDashboard.jsx";
import WardrobeGrid from "../components/WardrobeGrid.jsx";
import WardrobeInsights from "../components/WardrobeInsights.jsx";
import ImportPanel from "../components/ImportPanel.jsx";
import SyncBar from "../components/SyncBar.jsx";
import SettingsPanel from "../components/SettingsPanel.jsx";
import ScrollToTop from "../components/ScrollToTop.jsx";
import CommandPalette from "../components/CommandPalette.jsx";
import LoadingSkeleton from "../components/LoadingSkeleton.jsx";
import ToastProvider, { useToast } from "../components/ToastProvider.jsx";

function AppContent() {
  const { ready, status } = useBootstrap();
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const toast = useToast();

  useEffect(() => {
    document.body.style.background = isDark ? "#101114" : "#f9fafb";
    document.body.style.color = isDark ? "#f4f5f7" : "#1f2937";
  }, [isDark]);

  // Ctrl+K / Cmd+K to open command palette
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette(prev => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Show ready toast on first load
  useEffect(() => {
    if (ready && toast) {
      toast.addToast("Watch advisor loaded", "success", 2000);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaletteAction = useCallback((action) => {
    if (action === "settings") setShowSettings(true);
    else if (action === "export-json") {
      // Dispatch to settings export — trigger via custom event
      window.dispatchEvent(new CustomEvent("wa-export", { detail: "json" }));
      if (toast) toast.addToast("Exporting JSON...", "info", 2000);
    } else if (action === "export-csv") {
      window.dispatchEvent(new CustomEvent("wa-export", { detail: "csv" }));
      if (toast) toast.addToast("Exporting CSV...", "info", 2000);
    }
  }, [toast]);

  return (
    <div className="wa-container" style={{
      maxWidth: 1280, margin: "0 auto", padding: "16px 20px",
      color: isDark ? "#f4f5f7" : "#1f2937",
    }}>
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowPalette(true)}
      />
      {!ready ? (
        <LoadingSkeleton />
      ) : (
        <>
          <WatchDashboard />
          <WardrobeInsights />
          <style>{`
            .wa-main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
            @media (max-width: 700px) { .wa-main-grid { grid-template-columns: 1fr; } }
            .wa-outfit-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
          `}</style>
          <div className="wa-main-grid">
            <ImportPanel />
            <WardrobeGrid />
          </div>
        </>
      )}
      <SyncBar />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onAction={handlePaletteAction}
        />
      )}
      <ScrollToTop />
    </div>
  );
}

export default function AppShell() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
