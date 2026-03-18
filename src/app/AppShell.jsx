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
// Non-critical — lazy loaded to reduce initial bundle
const WardrobeGrid    = lazy(() => import("../components/WardrobeGrid.jsx"));
const WardrobeInsights = lazy(() => import("../components/WardrobeInsights.jsx"));
const ImportPanel     = lazy(() => import("../components/ImportPanel.jsx"));
const StatsPanel      = lazy(() => import("../components/StatsPanel.jsx"));
const CommandPalette  = lazy(() => import("../components/CommandPalette.jsx"));

// Heavy tabs — lazy-loaded so they don't bloat the initial bundle.
// Each is only mounted on first visit (TabPane keeps it alive after that).
const WeekPlanner       = lazy(() => import("../components/WeekPlanner.jsx"));
const WatchRotationPanel = lazy(() => import("../components/WatchRotationPanel.jsx"));
const AuditTab       = lazy(() => import("../components/AuditPanel.jsx").then(m => ({
  default: () => <><m.default /><m.PhotoVerifierPanel /></>,
})));
const SettingsPanel  = lazy(() => import("../components/SettingsPanel.jsx"));
const OccasionPlanner = lazy(() => import("../components/OccasionPlanner.jsx"));
const SelfiePanel    = lazy(() => import("../components/SelfiePanel.jsx"));
const WatchIDPanel   = lazy(() => import("../components/WatchIDPanel.jsx"));
const OutfitHistory  = lazy(() => import("../components/OutfitHistory.jsx"));
const OutfitGallery  = lazy(() => import("../components/OutfitGallery.jsx"));

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
  { key:"wardrobe", label:"Wardrobe", icon:"👔" },
  { key:"rotation", label:"Rotation", icon:"⌚" },
  { key:"stats",    label:"Stats",    icon:"📊" },
  { key:"history",  label:"History",  icon:"📅" },
  { key:"gallery",  label:"Gallery",  icon:"🖼️" },
  { key:"audit",    label:"Audit",    icon:"🔍" },
  { key:"occasion", label:"Plan",     icon:"✨" },
  { key:"selfie",   label:"Check",    icon:"📸" },
  { key:"watchid",  label:"ID",       icon:"🔎" },
];

function AppContent() {
  const { ready, status } = useBootstrap();
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
                margin:0; padding:0; gap:0;
                overflow-x:auto; overflow-y:hidden;
                -webkit-overflow-scrolling:touch;
                background:${isDark?"#171a21":"#fff"};
                border-top:1px solid ${isDark?"#2b3140":"#d1d5db"};
                padding-bottom: env(safe-area-inset-bottom, 0px);
                scrollbar-width:none;
              }
              .wa-tab-bar::-webkit-scrollbar { display:none; }
              .wa-tab-bar button {
                flex:0 0 auto; min-width:56px;
                border-radius:0 !important; border:none !important;
                border-top:2px solid transparent !important;
                padding:8px 6px 6px !important; font-size:11px !important;
                flex-direction:column; display:flex; align-items:center; gap:1px;
                white-space:nowrap;
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

          {/* Tab content — keep visited tabs mounted but hidden to preserve state
              (uploads, AI results, form progress) when navigating away */}
          <div className="wa-bottom-pad">
          <TabPane active={tab === "today"}><TodayPanel /></TabPane>

          <TabPane active={tab === "wardrobe"}>
            <WatchDashboard />
            <Suspense fallback={null}><WardrobeInsights /></Suspense>
            <style>{`
              .wa-main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
              @media (max-width: 700px) { .wa-main-grid { grid-template-columns: 1fr; } }
            `}</style>
            <div className="wa-main-grid">
              <Suspense fallback={null}><ImportPanel /></Suspense>
              <Suspense fallback={<div style={{ padding: 12, color: "#6b7280" }}>Loading wardrobe…</div>}><WardrobeGrid /></Suspense>
            </div>
          </TabPane>

          {/* Rotation/Planner tab — lazy-loaded */}
          <TabPane active={tab === "rotation"}>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading planner...</div>}>
              <WeekPlanner />
              <WatchRotationPanel />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "stats"}><Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading…</div>}><StatsPanel /></Suspense></TabPane>

          <TabPane active={tab === "history"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <OutfitHistory />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "gallery"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <OutfitGallery />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "audit"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <AuditTab />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "occasion"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <OccasionPlanner />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "selfie"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <SelfiePanel />
            </Suspense>
          </TabPane>

          <TabPane active={tab === "watchid"}>
            <Suspense fallback={<div style={{ padding:20, textAlign:"center", color:"#6b7280" }}>Loading…</div>}>
              <WatchIDPanel />
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
