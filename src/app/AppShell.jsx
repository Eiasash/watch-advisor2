import React from "react";
import { useBootstrap } from "./bootstrap.js";
import Header from "../components/Header.jsx";
import WatchDashboard from "../components/WatchDashboard.jsx";
import WardrobeGrid from "../components/WardrobeGrid.jsx";
import ImportPanel from "../components/ImportPanel.jsx";
import SyncBar from "../components/SyncBar.jsx";

export default function AppShell() {
  const { ready, status } = useBootstrap();

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 20px" }}>
      <Header />
      {!ready && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: "#171a21", border: "1px solid #2b3140",
          fontSize: 13, color: "#8b93a7"
        }}>
          {status}
        </div>
      )}
      <WatchDashboard />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        <ImportPanel />
        <WardrobeGrid />
      </div>
      <SyncBar />
    </div>
  );
}
