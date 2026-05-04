import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useBootstrap } from "./bootstrap.js";
import { useThemeStore } from "../stores/themeStore.js";
// Critical path — always loaded
import Header          from "../components/Header.jsx";
import TodayPanel      from "../components/TodayPanel.jsx";
import WatchDashboard  from "../components/WatchDashboard.jsx";
import SyncBar         from "../components/SyncBar.jsx";
import LoadingSkeleton from "../components/LoadingSkeleton.jsx";
import ToastProvider, { useToast } from "../components/ToastProvider.jsx";
import ScrollToTop     from "../components/ScrollToTop.jsx";
import InstallPrompt   from "../components/InstallPrompt.jsx";
import UpdateBanner    from "../components/UpdateBanner.jsx";
// Non-critical — lazy loaded to reduce initial bundle
const WardrobeGrid    = lazy(() => import("../components/WardrobeGrid.jsx"));
const ImportPanel     = lazy(() => import("../components/ImportPanel.jsx"));
const StatsPanel      = lazy(() => import("../components/StatsPanel.jsx"));
const StyleDNA        = lazy(() => import("../components/StyleDNA.jsx"));
const CommandPalette  = lazy(() => import("../components/CommandPalette.jsx"));

// Heavy tabs — lazy-loaded so they don't bloat the initial bundle.
const WeekPlanner       = lazy(() => import("../components/WeekPlanner.jsx"));
const WatchRotationPanel = lazy(() => import("../components/WatchRotationPanel.jsx"));
const TradeSimulator     = lazy(() => import("../components/plan/TradeSimulator.jsx"));
const AuditTab       = lazy(() => import("../components/AuditPanel.jsx").then(m => ({
  default: () => <><m.default /><m.PhotoVerifierPanel /></>,
})));
const SettingsPanel  = lazy(() => import("../components/SettingsPanel.jsx"));
const OutfitHistory  = lazy(() => import("../components/OutfitHistory.jsx"));
const WardrobeChat   = lazy(() => import("../components/WardrobeChat.jsx"));
const TravelTab      = lazy(() => import("../components/TravelTab.jsx"));
const StrapLibraryTab = lazy(() => import("../components/StrapLibraryTab.jsx"));

/**
 * TabPane — mounts children on first activation, then stays mounted but hidden.
 * Preserves component state (uploads, AI results, form inputs) across tab switches.
 */
function TabPane({ active, children }) {
  const [visited, setVisited] = useState(false);
  useEffect(() => { if (active && !visited) setVisited(true); }, [active, visited]);
  if (!visited) return null;
  return <div style={{ display: active ? "block" : "none" }}>{children}</div>;
}

// ── Tab navigation ────────────────────────────────────────────────────────────
const TABS = [
  { key:"today",    label:"Today",    icon:"👕" },
  { key:"plan",     label:"Plan",     icon:"📅" },
  { key:"wardrobe", label:"Wardrobe", icon:"👔" },
  { key:"straps",   label:"Straps",   icon:"➰" },
  { key:"audit",    label:"Audit",    icon:"🔍" },
  { key:"history",  label:"History",  icon:"📊" },
  { key:"travel",   label:"Travel",   icon:"✈️" },
];

function AppContent() {
  const { ready, status, syncError, retrySync, storageWarnPct } = useBootstrap();
  const { mode }          = useThemeStore();
  const isDark            = mode === "dark";

  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    const valid = TABS.map(t => t.key);
    return (p && valid.includes(p)) ? p : "today";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsScrollTo, setSettingsScrollTo] = useState(null);

  // BulkTag banner in WardrobeGrid fires this event
  useEffect(() => {
    function handleOpenSettings(e) {
      setSettingsScrollTo(e.detail?.scrollTo ?? null);
      setShowSettings(true);
    }
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);
  const [showPalette,  setShowPalette]  = useState(false);
  const [showChat,     setShowChat]     = useState(false);
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

  // Show persistent warning toast when storage is nearly full (>70%)
  useEffect(() => {
    if (storageWarnPct && toast) {
      toast.addToast(
        `Storage ${storageWarnPct}% full — old garment photos may be evicted. Export a backup.`,
        "warning",
        10000,
      );
    }
  }, [storageWarnPct]); // eslint-disable-line

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
      <UpdateBanner isDark={isDark} />
      <Header onOpenSettings={() => setShowSettings(true)} onOpenSearch={() => setShowPalette(true)} />

      {!ready ? (
        <LoadingSkeleton />
      ) : (
        <>
          {syncError && (
            <div style={{
              background: isDark ? "#3b1010" : "#fef2f2",
              border: `1px solid ${isDark ? "#7f1d1d" : "#fca5a5"}`,
              borderRadius: 10, padding: "10px 14px", marginBottom: 12,
              display: "flex", alignItems: "center", gap: 10,
              color: isDark ? "#fca5a5" : "#991b1b", fontSize: 13,
            }}>
              <span style={{ flex: 1 }}>Sync failed: {syncError}</span>
              <button onClick={retrySync} style={{
                background: "#3b82f6", color: "#fff", border: "none",
                borderRadius: 6, padding: "6px 14px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              }}>Retry sync</button>
            </div>
          )}
          {/* Tab bar — top on desktop, bottom on mobile */}
          <style>{`
            .wa-tab-bar {
              display:flex; gap:6px; margin-bottom:16px; overflow-x:auto; padding-bottom:2px;
            }
            @media (max-width:600px) {
              .wa-tab-bar {
                position:fixed; bottom:0; left:0; right:0; z-index:200;
                margin:0; padding:0; gap:0;
                display:flex !important;
                background:${isDark?"#171a21":"#fff"};
                border-top:1px solid ${isDark?"#2b3140":"#d1d5db"};
                padding-bottom: env(safe-area-inset-bottom, 0px);
              }
              .wa-tab-bar button {
                flex:1 1 0; min-width:0;
                border-radius:0 !important; border:none !important;
                border-top:2px solid transparent !important;
                padding:8px 4px 6px !important; font-size:11px !important;
                flex-direction:column; display:flex; align-items:center; justify-content:center; gap:1px;
                white-space:nowrap;
                -webkit-tap-highlight-color:transparent;
                touch-action:manipulation;
              }
              .wa-tab-bar button.active {
                border-top:2px solid #3b82f6 !important;
                background:${isDark?"#1d4ed811":"#eff6ff"};
              }
              .wa-bottom-pad { padding-bottom:72px; }
              .wa-tab-icon { font-size:16px; line-height:1; }
              .wa-tab-label { font-size:11px; line-height:1.2; }
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
                }}>
                <span className="wa-tab-icon">{t.icon}</span>
                <span className="wa-tab-label">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content — keep visited tabs mounted but hidden to preserve state */}
          <div className="wa-bottom-pad">
          <TabPane active={tab === "today"}>
            <TodayPanel />
            <WatchDashboard />
          </TabPane>

          <TabPane active={tab === "wardrobe"}>
            <style>{`
              .wa-main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
              @media (max-width: 700px) { .wa-main-grid { grid-template-columns: 1fr; } }
            `}</style>
            <div className="wa-main-grid">
              <Suspense fallback={null}><ImportPanel /></Suspense>
              <Suspense fallback={<div style={{ padding: 12, color: "#6b7280" }}>Loading wardrobe…</div>}><WardrobeGrid /></Suspense>
            </div>
          </TabPane>

          <TabPane active={tab === "straps"}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading straps…</div>}>
              <StrapLibraryTab />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "travel"}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading travel…</div>}>
              <TravelTab />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "plan"}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading planner...</div>}>
              <WeekPlanner />
              <WatchRotationPanel />
              <TradeSimulator />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "history"}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading…</div>}>
              <OutfitHistory />
              <StatsPanel />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "audit"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <AuditTab />
            </Suspense>
          </TabPane>
          </div>
        </>
      )}

      <SyncBar />
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={() => { setShowSettings(false); setSettingsScrollTo(null); }} scrollTo={settingsScrollTo} />
        </Suspense>
      )}
      {showPalette   && <Suspense fallback={null}><CommandPalette onClose={() => setShowPalette(false)} onAction={handlePaletteAction} /></Suspense>}
      <ScrollToTop />

      {/* Chat FAB */}
      {!showChat && (
        <button onClick={() => setShowChat(true)} style={{
          position: "fixed", bottom: 80, right: 16, zIndex: 210,
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
          border: "none", boxShadow: "0 4px 16px rgba(59,130,246,0.4)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: "#fff",
        }}>💬</button>
      )}

      {/* Chat overlay */}
      {showChat && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: isDark ? "#0a0c10" : "#f8fafc",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 16px", borderBottom: `1px solid ${isDark ? "#2b3140" : "#e5e7eb"}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>💬 Wardrobe AI</span>
            <button onClick={() => setShowChat(false)} style={{
              background: "none", border: "none", color: isDark ? "#6b7280" : "#9ca3af",
              fontSize: 22, cursor: "pointer", padding: "4px 8px",
            }}>✕</button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading chat...</div>}>
              <WardrobeChat />
            </Suspense>
          </div>
        </div>
      )}

      <InstallPrompt isDark={isDark} />
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
