/**
 * a11y contrast regression guard — pinned 2026-05-10 in v1.13.41/42.
 *
 * Live audit on https://watch-advisor2.netlify.app surfaced 24 WCAG 2.1 AA
 * contrast violations on first pass. Fixed in PR #197 (24→11) and the v1.13.42
 * follow-up (11→target 0) — same loop-until-verified pattern as Geri #125.
 *
 * Rules guarded here:
 *   1. Muted-text pattern is `isDark ? "#9ca3af" : "#6b7280"` — NOT the inverted
 *      `isDark ? "#6b7280" : "#9ca3af"`. The latter fails AA on both themes
 *      (#6b7280 on dark slate ≈ 3.85; #9ca3af on white ≈ 2.54).
 *   2. White-on-green-500 (#22c55e) buttons are banned — too dim (2.28). Use
 *      green-700 (#15803d) for primary CTA backgrounds.
 *   3. White-on-blue-500 (#3b82f6) buttons should use blue-600 (#2563eb,
 *      5.17:1) — the original 3.68 fails AA at small sizes.
 *   4. SettingsPanel `mutedColor` cannot be `isDark ? "#6b7280" : "#6b7280"`
 *      (the both-branches-identical bug — fails AA on dark).
 *   5. QuickStrapSwap accent must be theme-aware violet (light: #7c3aed) so
 *      the selected-chip text on light-violet bg passes 4.5:1.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "src");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkJsx(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJsx(p));
    else if (ent.name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

const ALL_JSX = walkJsx(ROOT);

describe("a11y contrast — PR #197 (v1.13.41) regression guards", () => {
  it("rule 1: no JSX file uses the inverted muted pattern", () => {
    // The inverted pattern `isDark ? "#6b7280" : "#9ca3af"` was the bulk of the
    // 24 contrast violations on the live audit. After the swap, EVERY occurrence
    // of these two colors in a `isDark ?` ternary must be in the correct order.
    const offenders = [];
    for (const fp of ALL_JSX) {
      const c = fs.readFileSync(fp, "utf8");
      // Match both spaced and compact syntaxes
      if (/isDark\s*\?\s*"#6b7280"\s*:\s*"#9ca3af"/.test(c)) {
        offenders.push(path.relative(ROOT, fp));
      }
    }
    expect(offenders, `inverted muted pattern reintroduced in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("rule 2: WatchDashboard 'Wear This Outfit' button uses green-700, not green-500", () => {
    const c = read(path.join("components", "WatchDashboard.jsx"));
    // The exact two-color tuple in the disabled/active ternary
    expect(c).toContain('background: outfitLogged ? "#14532d" : "#15803d"');
    // And does NOT use the failing palette
    expect(c).not.toContain('background: outfitLogged ? "#166534" : "#22c55e"');
  });

  it("rule 2b: WeekPlanner 'Wear This Outfit' button uses green-700", () => {
    const c = read(path.join("components", "WeekPlanner.jsx"));
    expect(c).toContain('background: isToday ? "#15803d"');
  });

  it("rule 3: known white-on-blue CTAs use blue-600 (#2563eb), not blue-500", () => {
    // Spot-checks — full audit lives in the live URL re-scan.
    const installPrompt = read(path.join("components", "InstallPrompt.jsx"));
    expect(installPrompt).toContain('background: "#2563eb"');

    const appShell = read(path.join("app", "AppShell.jsx"));
    // Retry sync button
    expect(appShell.match(/Retry sync/)).toBeTruthy();
    expect(appShell).toMatch(/background: "#2563eb",[\s\S]*?Retry sync/);
  });

  it("rule 4: SettingsPanel mutedColor is theme-aware (not both-#6b7280 bug)", () => {
    const c = read(path.join("components", "SettingsPanel.jsx"));
    expect(c).toContain('const mutedColor = isDark ? "#9ca3af" : "#6b7280"');
    expect(c).not.toContain('const mutedColor = isDark ? "#6b7280" : "#6b7280"');
  });

  it("rule 5: QuickStrapSwap accent is theme-aware violet", () => {
    const c = read(path.join("components", "today", "QuickStrapSwap.jsx"));
    expect(c).toContain('const accent = isDark ? "#a78bfa" : "#7c3aed"');
    // The flat `accent = "#8b5cf6"` was the failing version (3.78 on light violet)
    expect(c).not.toContain('const accent = "#8b5cf6"');
  });

  it("rule 6: AppShell selected-tab text is theme-aware (not flat #3b82f6)", () => {
    const c = read(path.join("app", "AppShell.jsx"));
    // Selected tab — light mode needs darker blue (#1d4ed8) for AA on tinted bg
    expect(c).toContain('tab === t.key ? (isDark ? "#60a5fa" : "#1d4ed8")');
  });

  it("rule 7: WardrobeGrid empty-state and dot use theme-aware muted text", () => {
    const c = read(path.join("components", "WardrobeGrid.jsx"));
    // Was `color:"#4b5563"` flat — fails on dark card bg (~2.30)
    expect(c).not.toMatch(/<div\s+style=\{\{\s*color:"#4b5563",\s*fontSize:14/);
    expect(c).toContain('color:isDark?"#9ca3af":"#6b7280", fontSize:14');
  });
});
