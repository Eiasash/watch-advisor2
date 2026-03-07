import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useBootstrap } from "./bootstrap.js";
import { useThemeStore } from "../stores/themeStore.js";
import Header        from "../components/Header.jsx";
import WatchDashboard  from "../components/WatchDashboard.jsx";
import WardrobeInsights from "../components/WardrobeInsights.jsx";
import ImportPanel    from "../components/ImportPanel.jsx";
import WardrobeGrid   from "../components/WardrobeGrid.jsx";
import TodayPanel     from "../components/TodayPanel.jsx";
import StatsPanel     from "../components/StatsPanel.jsx";
import AuditPanel, { PhotoVerifierPanel } from "../components/AuditPanel.jsx";

const WeekPlanner = lazy(() => import("../components/WeekPlanner.jsx"));
import SyncBar        from "../components/SyncBar.jsx";
import SettingsPanel  from "../components/SettingsPanel.jsx";
import ScrollToTop    from "../components/ScrollToTop.jsx";
import OccasionPanel  from "../components/OccasionPanel.jsx";
import CommandPalette from "../components/CommandPalette.jsx";
import LoadingSkeleton from "../components/LoadingSkeleton.jsx";
import ToastProvider, { useToast } from "../components/ToastProvider.jsx";

// ── Tab navigation ────────────────────────────────────────────────────────────
const TABS = [
  { key:"today",    label:"👕 Today"    },
  { key:"wardrobe", label:"👔 Wardrobe" },
  { key:"rotation", label:"⌚ Rotation" },
  { key:"stats",    label:"📊 Stats"    },
  { key:"audit",    label:"🔍 Audit"    },
  { key:"occasion",  label:"✨ Plan"    },
];

function AppContent() {
  const { ready, status } = useBootstrap();
  const { mode }          = useThemeStore();
  const isDark            = mode === "dark";

  const [tab, setTab]             = useState("today");
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette,  setShowPalette]  = useState(false);
  const toast = useToast();

  useEffect(() => {
    document.body.style.background = isDark ? "#101114" : "#f9fafb";
    document.body.style.color      = isDark ? "#f4f5f7" : "#1f2937";
  }, [isDark]);

  // Ctrl/Cmd+K — command palette
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette(v => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (ready && toast) toast.addToast("Watch Advisor ready", "success", 2000);
  }, [ready]); // eslint-disable-line

  const handlePaletteAction = useCallback(action => {
    if (action === "settings") setShowSettings(true);
    else if (action === "export-json") {
      window.dispatchEvent(new CustomEvent("wa-export", { detail: "json" }));
      toast?.addToast("Exporting JSON…", "info", 2000);
    } else if (action === "export-csv") {
      window.dispatchEvent(new CustomEvent("wa-export", { detail: "csv" }));
      toast?.addToast("Exporting CSV…", "info", 2000);
    }
  }, [toast]);

  const bg     = isDark ? "#101114" : "#f9fafb";
  const border = isDark ? "#2b3140" : "#d1d5db";
  const text   = isDark ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{ maxWidth:1360, margin:"0 auto", padding:"14px 16px", color:text }}>
      <Header onOpenSettings={() => setShowSettings(true)} onOpenSearch={() => setShowPalette(true)} />

      {!ready ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Tab bar — top on desktop, bottom on mobile */}
          <style>{`
            .wa-tab-bar {
              display:flex; gap:6px; margin-bottom:16px; overflow-x:auto; padding-bottom:2px;
            }
            @media (max-width:600px) {
              .wa-tab-bar {
                position:fixed; bottom:0; left:0; right:0; z-index:200;
                margin:0; padding:0; gap:0; overflow:hidden;
                background:${isDark?"#171a21":"#fff"};
                border-top:1px solid ${isDark?"#2b3140":"#d1d5db"};
                padding-bottom: env(safe-area-inset-bottom, 0px);
              }
              .wa-tab-bar button {
                flex:1; border-radius:0 !important; border:none !important;
                border-top:2px solid transparent !important;
                padding:10px 4px 8px !important; font-size:11px !important;
                flex-direction:column; display:flex; align-items:center; gap:2px;
              }
              .wa-tab-bar button.active {
                border-top:2px solid #3b82f6 !important;
              }
              .wa-bottom-pad { padding-bottom:64px; }
            }
          `}</style>
          <div className="wa-tab-bar">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={tab === t.key ? "active" : ""}
                style={{
                  padding:"8px 16px", borderRadius:10, fontSize:13, fontWeight:700,
                  border:`1px solid ${tab === t.key ? "#3b82f6" : border}`,
                  background: tab === t.key ? "#1d4ed822" : "transparent",
                  color: tab === t.key ? "#3b82f6" : isDark ? "#8b93a7" : "#6b7280",
                  cursor:"pointer", whiteSpace:"nowrap",
                }}>{t.label}</button>
            ))}
          </div>

          {/* Tab content */}
          <div className="wa-bottom-pad">
          {tab === "today" && <TodayPanel />}

          {tab === "wardrobe" && (
            <>
              <WatchDashboard />
              <WardrobeInsights />
              <style>{`
                .wa-main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
                @media (max-width: 700px) { .wa-main-grid { grid-template-columns: 1fr; } }
              `}</style>
              <div className="wa-main-grid">
                <ImportPanel />
                <WardrobeGrid />
              </div>
            </>
          )}

          {/* Rotation/Planner tab — lazy-loaded */}
          {tab === "rotation" && (
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading planner...</div>}>
              <WeekPlanner />
            </Suspense>
          )}

          {/* Audit tab */}
          {tab === "audit" && <><AuditPanel /><PhotoVerifierPanel /></>}

          {/* Occasion planner tab */}
          {tab === "occasion" && <OccasionPanel />}
          </div>
        </>
      )}

      <SyncBar />
      {showSettings  && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showPalette   && <CommandPalette onClose={() => setShowPalette(false)} onAction={handlePaletteAction} />}
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
