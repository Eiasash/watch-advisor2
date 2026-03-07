import React, { useState, useEffect } from "react";
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

export default function AppShell() {
  const { ready, status } = useBootstrap();
  const { mode } = useThemeStore();
  const isDark = mode === "dark";
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    document.body.style.background = isDark ? "#101114" : "#f9fafb";
    document.body.style.color = isDark ? "#f4f5f7" : "#1f2937";
  }, [isDark]);

  return (
    <div style={{
      maxWidth: 1280, margin: "0 auto", padding: "16px 20px",
      color: isDark ? "#f4f5f7" : "#1f2937",
    }}>
      <Header onOpenSettings={() => setShowSettings(true)} />
      {!ready && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: isDark ? "#171a21" : "#ffffff",
          border: `1px solid ${isDark ? "#2b3140" : "#d1d5db"}`,
          fontSize: 13, color: "#8b93a7"
        }}>
          {status}
        </div>
      )}
      <WatchDashboard />
      <WardrobeInsights />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        <ImportPanel />
        <WardrobeGrid />
      </div>
      <SyncBar />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <ScrollToTop />
    </div>
  );
}
