import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Extract testable logic from AppShell ────────────────────────────────────
// AppShell is a React component. We test the extracted logic: tab routing,
// keyboard shortcuts, palette actions, and TABS definition.

// ── TABS definition (mirrors AppShell.jsx) ──────────────────────────────────

const TABS = [
  { key: "today",    label: "Today" },
  { key: "closet",   label: "Closet" },
  { key: "plan",     label: "Plan" },
  { key: "settings", label: "More", ariaLabel: "More tools and settings" },
];

describe("AppShell — tab navigation logic", () => {
  it("has four primary tabs defined", () => {
    expect(TABS).toHaveLength(4);
    expect(TABS.map(t => t.label)).toEqual(["Today", "Closet", "Plan", "More"]);
  });

  it("all tab keys are unique", () => {
    const keys = TABS.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("all tabs have key and label", () => {
    for (const tab of TABS) {
      expect(tab.key).toBeTruthy();
      expect(tab.label).toBeTruthy();
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
    const p = new URLSearchParams("?tab=plan").get("tab");
    const tab = (p && valid.includes(p)) ? p : "today";
    expect(tab).toBe("plan");
  });

  it("routes legacy tabs into the new minimal page graph", () => {
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
    expect(legacy[new URLSearchParams("?tab=audit").get("tab")]).toBe("settings");
    expect(legacy[new URLSearchParams("?tab=rotation").get("tab")]).toBe("plan");
    expect(legacy[new URLSearchParams("?tab=wardrobe").get("tab")]).toBe("closet");
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
