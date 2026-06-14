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
const AuditPanel         = lazy(() => import("../components/AuditPanel.jsx"));
const PhotoVerifierPanel = lazy(() => import("../components/AuditPanel.jsx").then(m => ({ default: m.PhotoVerifierPanel })));
const RepairToolsPanel   = lazy(() => import("../components/AuditPanel.jsx").then(m => ({ default: m.RepairToolsPanel })));
const CollectionValuePanel = lazy(() => import("../components/AuditPanel.jsx").then(m => ({ default: m.CollectionValuePanel })));
const SettingsPanel  = lazy(() => import("../components/SettingsPanel.jsx"));
const OutfitHistory  = lazy(() => import("../components/OutfitHistory.jsx"));
const TravelTab      = lazy(() => import("../components/TravelTab.jsx"));
const StrapLibraryTab = lazy(() => import("../components/StrapLibraryTab.jsx"));

/**
 * TabPane — mounts children on first activation, then stays mounted but hidden.
 * Preserves component state (uploads, AI results, form inputs) across tab switches.
 */
function TabPane({ active, children, tabKey }) {
  const [visited, setVisited] = useState(false);
  useEffect(() => { if (active && !visited) setVisited(true); }, [active, visited]);
  // Always render the wrapper so aria-controls on the tab buttons has a
  // resolvable target on initial load — even for tabs the user hasn't
  // visited yet. Lazy-load behavior preserved: children only render after
  // first activation, so the heavy panel contents still don't mount up
  // front. Caught by Codex P2 on PR #224 — without this, inactive tabs'
  // aria-controls pointed to missing elements (regression of the
  // aria-valid-attr-value fix).
  return (
    <div
      role="tabpanel"
      id={`wa-tabpanel-${tabKey}`}
      aria-labelledby={`wa-tab-${tabKey}`}
      hidden={!active}
      style={{ display: active ? "block" : "none" }}
    >
      {visited ? children : null}
    </div>
  );
}

// ── Tab navigation ────────────────────────────────────────────────────────────
const TABS = [
  { key:"today",    label:"Today" },
  { key:"closet",   label:"Closet" },
  { key:"plan",     label:"Plan" },
  { key:"settings", label:"More", ariaLabel:"More tools and settings" },
];

function AppContent() {
  const { ready, status, syncError, retrySync, storageWarnPct } = useBootstrap();
  const { mode }          = useThemeStore();
  const isDark            = mode === "dark";

  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    const legacy = {
      wardrobe: "closet",
      straps: "closet",
      rotation: "plan",
      occasion: "plan",
      planner: "plan",
      stats: "settings",
      history: "settings",
      gallery: "settings",
      audit: "settings",
      travel: "settings",
      selfie: "settings",
      watchid: "settings",
    };
    const requested = legacy[p] || p;
    const valid = TABS.map(t => t.key);
    return (requested && valid.includes(requested)) ? requested : "today";
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsScrollTo, setSettingsScrollTo] = useState(null);
  const [planHealthOpen, setPlanHealthOpen] = useState(false);
  const [planTradeOpen, setPlanTradeOpen] = useState(false);
  const [moreActivityOpen, setMoreActivityOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [moreTool, setMoreTool] = useState(null);

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
  const moreToolLabels = {
    audit: "Wardrobe audit",
    photos: "Photo verifier",
    repair: "Repair and debug",
    value: "Collection value",
    travel: "Travel planner",
  };

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
                background: "#2563eb", color: "#fff", border: "none",
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
                padding:12px 4px 10px !important; font-size:12px !important; min-height:44px;
                display:flex; align-items:center; justify-content:center;
                white-space:nowrap;
                -webkit-tap-highlight-color:transparent;
                touch-action:manipulation;
              }
              .wa-tab-bar button.active {
                border-top:2px solid #3b82f6 !important;
                background:${isDark?"#1d4ed811":"#eff6ff"};
              }
              .wa-bottom-pad { padding-bottom:72px; }
              .wa-tab-label { font-size:12px; line-height:1.2; }
            }
            .wa-disclosure-stack { display:grid; gap:10px; margin-bottom:16px; }
            .wa-disclosure {
              border:1px solid ${border};
              border-radius:12px;
              background:${isDark ? "#171a21" : "#fff"};
              overflow:hidden;
            }
            .wa-disclosure summary {
              min-height:44px;
              padding:12px 14px;
              cursor:pointer;
              list-style:none;
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:12px;
              color:${text};
              font-size:13px;
              font-weight:800;
            }
            .wa-disclosure summary::-webkit-details-marker { display:none; }
            .wa-disclosure summary::after {
              content:"+";
              width:24px;
              height:24px;
              border-radius:999px;
              border:1px solid ${border};
              display:flex;
              align-items:center;
              justify-content:center;
              color:${isDark ? "#9ca3af" : "#6b7280"};
              font-size:16px;
              line-height:1;
              flex:0 0 auto;
            }
            .wa-disclosure[open] summary {
              border-bottom:1px solid ${border};
            }
            .wa-disclosure[open] summary::after { content:"-"; }
            .wa-disclosure small {
              display:block;
              margin-top:2px;
              color:${isDark ? "#9ca3af" : "#6b7280"};
              font-size:11px;
              font-weight:600;
            }
            .wa-disclosure-body {
              padding:12px;
              display:grid;
              gap:12px;
            }
            .wa-disclosure-body button,
            .wa-disclosure-body select {
              min-height:44px;
              min-width:44px;
            }
            .wa-tool-grid {
              display:grid;
              grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));
              gap:10px;
            }
            .wa-tool-button,
            .wa-tool-back {
              border:1px solid ${border};
              background:${isDark ? "#10141d" : "#f9fafb"};
              color:${text};
              border-radius:10px;
              cursor:pointer;
              text-align:left;
              font:inherit;
            }
            .wa-tool-button {
              min-height:74px;
              padding:12px;
            }
            .wa-tool-button:hover,
            .wa-tool-button:focus-visible,
            .wa-tool-back:hover,
            .wa-tool-back:focus-visible {
              outline:2px solid #3b82f6;
              outline-offset:2px;
              border-color:#3b82f6;
            }
            .wa-tool-button strong {
              display:block;
              font-size:13px;
              font-weight:800;
              margin-bottom:4px;
            }
            .wa-tool-button span {
              display:block;
              color:${isDark ? "#9ca3af" : "#6b7280"};
              font-size:12px;
              font-weight:600;
              line-height:1.35;
            }
            .wa-tool-back {
              justify-self:start;
              padding:8px 12px;
              font-size:12px;
              font-weight:800;
            }
            .wa-tool-workspace {
              display:grid;
              gap:12px;
              min-width:0;
            }
            .wa-tool-title {
              font-size:14px;
              font-weight:900;
              color:${text};
            }
          `}</style>
          <div className="wa-tab-bar" role="tablist" aria-label="App sections">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={tab === t.key ? "active" : ""}
                role="tab"
                aria-selected={tab === t.key}
                aria-controls={`wa-tabpanel-${t.key}`}
                aria-label={t.ariaLabel ?? t.label}
                id={`wa-tab-${t.key}`}
                style={{
                  padding:"11px 16px", borderRadius:10, fontSize:13, fontWeight:700,
                  border:`1px solid ${tab === t.key ? "#3b82f6" : border}`,
                  background: tab === t.key ? "#1d4ed822" : "transparent",
                  color: tab === t.key ? (isDark ? "#60a5fa" : "#1d4ed8") : isDark ? "#8b93a7" : "#6b7280",
                  cursor:"pointer", whiteSpace:"nowrap", minHeight:44,
                }}>
                <span className="wa-tab-label">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content — keep visited tabs mounted but hidden to preserve state */}
          <div className="wa-bottom-pad">
          <TabPane active={tab === "today"} tabKey="today">
            <TodayPanel />
            <WatchDashboard />
          </TabPane>

          <TabPane active={tab === "closet"} tabKey="closet">
            <style>{`
              .wa-main-grid {
                display: grid;
                grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
                gap: 16px;
                align-items: start;
                min-width: 0;
                max-width: 100%;
              }
              .wa-main-grid > *,
              .wa-closet-stack,
              .wa-closet-stack > section {
                min-width: 0;
                max-width: 100%;
              }
              .wa-closet-stack { display: grid; gap: 16px; }
              .wa-closet-stack > section { overflow: hidden; }
              .wa-section-title { font-size: 13px; font-weight: 800; margin: 0 0 8px; color: ${isDark ? "#e2e8f0" : "#111827"}; }
              @media (max-width: 700px) {
                .wa-main-grid {
                  grid-template-columns: minmax(0, 1fr);
                  overflow: hidden;
                }
              }
            `}</style>
            <div className="wa-main-grid">
              <Suspense fallback={null}><ImportPanel /></Suspense>
              <div className="wa-closet-stack">
                <section>
                  <h2 className="wa-section-title">Wardrobe</h2>
                  <Suspense fallback={<div style={{ padding: 12, color: "#6b7280" }}>Loading wardrobe...</div>}><WardrobeGrid /></Suspense>
                </section>
                <section>
                  <h2 className="wa-section-title">Straps</h2>
                  <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading straps...</div>}>
                    <StrapLibraryTab />
                  </Suspense>
                </section>
              </div>
            </div>
          </TabPane>

          <TabPane active={tab === "plan"} tabKey="plan">
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading planner...</div>}>
              <WeekPlanner />
              <div className="wa-disclosure-stack" aria-label="Planner secondary tools">
                <details className="wa-disclosure" onToggle={e => setPlanHealthOpen(e.currentTarget.open)}>
                  <summary>
                    <span>
                      Rotation health
                      <small>Idle days, wear count, and cost per wear</small>
                    </span>
                  </summary>
                  {planHealthOpen && (
                    <div className="wa-disclosure-body">
                      <WatchRotationPanel />
                    </div>
                  )}
                </details>
                <details className="wa-disclosure" onToggle={e => setPlanTradeOpen(e.currentTarget.open)}>
                  <summary>
                    <span>
                      Trade simulator
                      <small>Collection value and swap decisions</small>
                    </span>
                  </summary>
                  {planTradeOpen && (
                    <div className="wa-disclosure-body">
                      <TradeSimulator />
                    </div>
                  )}
                </details>
              </div>
            </Suspense>
          </TabPane>

          <TabPane active={tab === "settings"} tabKey="settings">
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: 14,
                background: isDark ? "#171a21" : "#fff",
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>App settings</div>
                <button onClick={() => setShowSettings(true)} style={{
                  minHeight: 44,
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}>Open Settings</button>
              </div>
              <details className="wa-disclosure" onToggle={e => setMoreActivityOpen(e.currentTarget.open)}>
                <summary>
                  <span>
                    Activity
                    <small>Outfit history and statistics</small>
                  </span>
                </summary>
                {moreActivityOpen && (
                  <div className="wa-disclosure-body">
                    <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading activity...</div>}>
                      <OutfitHistory />
                      <StatsPanel />
                    </Suspense>
                  </div>
                )}
              </details>
              <details className="wa-disclosure" onToggle={e => {
                const open = e.currentTarget.open;
                setMoreToolsOpen(open);
                if (!open) setMoreTool(null);
              }}>
                <summary>
                  <span>
                    Tools
                    <small>Open one utility at a time</small>
                  </span>
                </summary>
                {moreToolsOpen && (
                  <div className="wa-disclosure-body">
                    {!moreTool ? (
                      <div className="wa-tool-grid" aria-label="More tools launcher">
                        <button className="wa-tool-button" type="button" onClick={() => setMoreTool("audit")}>
                          <strong>Wardrobe audit</strong>
                          <span>AI grade, gaps, declutter, and investment notes</span>
                        </button>
                        <button className="wa-tool-button" type="button" onClick={() => setMoreTool("photos")}>
                          <strong>Photo verifier</strong>
                          <span>Find duplicate, mismatched, and full-outfit photos</span>
                        </button>
                        <button className="wa-tool-button" type="button" onClick={() => setMoreTool("repair")}>
                          <strong>Repair and debug</strong>
                          <span>Fix orphaned history, sync angles, and inspect app health</span>
                        </button>
                        <button className="wa-tool-button" type="button" onClick={() => setMoreTool("value")}>
                          <strong>Collection value</strong>
                          <span>Value, cost-per-wear, and watch collection trends</span>
                        </button>
                        <button className="wa-tool-button" type="button" onClick={() => setMoreTool("travel")}>
                          <strong>Travel planner</strong>
                          <span>Pack watches and outfits for a trip</span>
                        </button>
                      </div>
                    ) : (
                      <div className="wa-tool-workspace">
                        <button className="wa-tool-back" type="button" onClick={() => setMoreTool(null)}>Back to tools</button>
                        <div className="wa-tool-title">{moreToolLabels[moreTool]}</div>
                        <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>Loading {moreToolLabels[moreTool]}...</div>}>
                          {moreTool === "audit" && <AuditPanel />}
                          {moreTool === "photos" && <PhotoVerifierPanel />}
                          {moreTool === "repair" && <RepairToolsPanel />}
                          {moreTool === "value" && <CollectionValuePanel isDark={isDark} />}
                          {moreTool === "travel" && <TravelTab />}
                        </Suspense>
                      </div>
                    )}
                  </div>
                )}
              </details>
            </div>
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
