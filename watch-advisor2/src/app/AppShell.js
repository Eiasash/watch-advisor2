import React from "react";
import { useBootstrap } from "./bootstrap.js";
import Header from "../components/Header.js";
import WatchDashboard from "../components/WatchDashboard.js";
import WardrobeGrid from "../components/WardrobeGrid.js";
import ImportPanel from "../components/ImportPanel.js";
import SyncBar from "../components/SyncBar.js";

export default function AppShell() {
  const { ready, status } = useBootstrap();

  return React.createElement("div", {
    style: { maxWidth: 1240, margin: "0 auto", padding: 16 }
  },
    React.createElement(Header, null),
    !ready && React.createElement("div", {
      style: {
        padding: 12, borderRadius: 12, marginBottom: 16,
        background: "#171a21", border: "1px solid #2b3140"
      }
    }, status),
    React.createElement(WatchDashboard, null),
    React.createElement("div", {
      style: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }
    },
      React.createElement(ImportPanel, null),
      React.createElement(WardrobeGrid, null)
    ),
    React.createElement(SyncBar, null)
  );
}
