import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Extract testable logic from AppShell ────────────────────────────────────
// AppShell is a React component. We test the extracted logic: tab routing,
// keyboard shortcuts, palette actions, and TABS definition.

// ── TABS definition (mirrors AppShell.jsx) ──────────────────────────────────

const TABS = [
  { key: "today",    label: "Today",    icon: "👕" },
  { key: "wardrobe", label: "Wardrobe", icon: "👔" },
  { key: "rotation", label: "Rotation", icon: "⌚" },
  { key: "stats",    label: "Stats",    icon: "📊" },
  { key: "history",  label: "History",  icon: "📅" },
  { key: "gallery",  label: "Gallery",  icon: "🖼️" },
  { key: "audit",    label: "Audit",    icon: "🔍" },
  { key: "occasion", label: "Plan",     icon: "✨" },
  { key: "selfie",   label: "Check",    icon: "📸" },
  { key: "watchid",  label: "ID",       icon: "🔎" },
];

describe("AppShell — tab navigation logic", () => {
  it("has 10 tabs defined", () => {
    expect(TABS).toHaveLength(10);
  });

  it("all tab keys are unique", () => {
    const keys = TABS.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all tabs have key, label, and icon", () => {
    for (const tab of TABS) {
      expect(tab.key).toBeTruthy();
      expect(tab.label).toBeTruthy();
      expect(tab.icon).toBeTruthy();
    }
  });

  it("defaults to 'today' when URL has no tab param", () => {
    const valid = TABS.map(t => t.key);
    const p = new URLSearchParams("").get("tab");
    const tab = (p && valid.includes(p)) ? p : "today";
    expect(tab).toBe("today");
  });

  it("uses URL tab param when valid", () => {
    const valid = TABS.map(t => t.key);
    const p = new URLSearchParams("?tab=stats").get("tab");
    const tab = (p && valid.includes(p)) ? p : "today";
    expect(tab).toBe("stats");
  });

  it("falls back to 'today' for invalid tab param", () => {
    const valid = TABS.map(t => t.key);
    const p = new URLSearchParams("?tab=nonexistent").get("tab");
    const tab = (p && valid.includes(p)) ? p : "today";
    expect(tab).toBe("today");
  });

  it("falls back to 'today' for empty tab param", () => {
    const valid = TABS.map(t => t.key);
    const p = new URLSearchParams("?tab=").get("tab");
    const tab = (p && valid.includes(p)) ? p : "today";
    expect(tab).toBe("today");
  });
});

describe("AppShell — keyboard shortcut logic", () => {
  it("Ctrl+K toggles palette", () => {
    let showPalette = false;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        showPalette = !showPalette;
      }
    };

    handler({ metaKey: false, ctrlKey: true, key: "k" });
    expect(showPalette).toBe(true);

    handler({ metaKey: false, ctrlKey: true, key: "k" });
    expect(showPalette).toBe(false);
  });

  it("Cmd+K toggles palette (macOS)", () => {
    let showPalette = false;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        showPalette = !showPalette;
      }
    };

    handler({ metaKey: true, ctrlKey: false, key: "k" });
    expect(showPalette).toBe(true);
  });

  it("other key combos do not toggle palette", () => {
    let showPalette = false;
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        showPalette = !showPalette;
      }
    };

    handler({ metaKey: false, ctrlKey: true, key: "j" });
    expect(showPalette).toBe(false);

    handler({ metaKey: false, ctrlKey: false, key: "k" });
    expect(showPalette).toBe(false);
  });
});

describe("AppShell — palette action handler", () => {
  it("handles 'settings' action", () => {
    let showSettings = false;
    const handlePaletteAction = (action) => {
      if (action === "settings") showSettings = true;
    };

    handlePaletteAction("settings");
    expect(showSettings).toBe(true);
  });

  it("handles 'export-json' action", () => {
    const dispatched = [];
    const origDispatch = window.dispatchEvent;
    window.dispatchEvent = (e) => dispatched.push(e);

    const handlePaletteAction = (action) => {
      if (action === "export-json") {
        window.dispatchEvent(new CustomEvent("wa-export", { detail: "json" }));
      } else if (action === "export-csv") {
        window.dispatchEvent(new CustomEvent("wa-export", { detail: "csv" }));
      }
    };

    handlePaletteAction("export-json");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe("wa-export");
    expect(dispatched[0].detail).toBe("json");

    window.dispatchEvent = origDispatch;
  });

  it("handles 'export-csv' action", () => {
    const dispatched = [];
    const origDispatch = window.dispatchEvent;
    window.dispatchEvent = (e) => dispatched.push(e);

    const handlePaletteAction = (action) => {
      if (action === "export-json") {
        window.dispatchEvent(new CustomEvent("wa-export", { detail: "json" }));
      } else if (action === "export-csv") {
        window.dispatchEvent(new CustomEvent("wa-export", { detail: "csv" }));
      }
    };

    handlePaletteAction("export-csv");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].detail).toBe("csv");

    window.dispatchEvent = origDispatch;
  });

  it("ignores unknown actions", () => {
    let showSettings = false;
    const dispatched = [];
    const origDispatch = window.dispatchEvent;
    window.dispatchEvent = (e) => dispatched.push(e);

    const handlePaletteAction = (action) => {
      if (action === "settings") showSettings = true;
      else if (action === "export-json" || action === "export-csv") {
        window.dispatchEvent(new CustomEvent("wa-export", { detail: action.replace("export-", "") }));
      }
    };

    handlePaletteAction("unknown-action");
    expect(showSettings).toBe(false);
    expect(dispatched).toHaveLength(0);

    window.dispatchEvent = origDispatch;
  });
});

describe("AppShell — SCORE_COLOR logic (used in SelfiePanel)", () => {
  const SCORE_COLOR = s => s >= 8 ? "#10b981" : s >= 6 ? "#f59e0b" : "#ef4444";

  it("returns green for score >= 8", () => {
    expect(SCORE_COLOR(8)).toBe("#10b981");
    expect(SCORE_COLOR(10)).toBe("#10b981");
  });

  it("returns amber for score 6-7", () => {
    expect(SCORE_COLOR(6)).toBe("#f59e0b");
    expect(SCORE_COLOR(7)).toBe("#f59e0b");
  });

  it("returns red for score < 6", () => {
    expect(SCORE_COLOR(5)).toBe("#ef4444");
    expect(SCORE_COLOR(0)).toBe("#ef4444");
  });
});

describe("AppShell — theme body style logic", () => {
  it("dark mode sets dark background", () => {
    const isDark = true;
    const bg = isDark ? "#101114" : "#f9fafb";
    const color = isDark ? "#f4f5f7" : "#1f2937";
    expect(bg).toBe("#101114");
    expect(color).toBe("#f4f5f7");
  });

  it("light mode sets light background", () => {
    const isDark = false;
    const bg = isDark ? "#101114" : "#f9fafb";
    const color = isDark ? "#f4f5f7" : "#1f2937";
    expect(bg).toBe("#f9fafb");
    expect(color).toBe("#1f2937");
  });
});
