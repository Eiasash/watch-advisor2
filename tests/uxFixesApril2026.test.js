/**
 * Pin tests for the 5 UX fixes shipped 2026-04-28.
 *
 * 1. Sweater bug: weather=null / weather={tempC:25} produces no sweater.
 * 2. AI labeling: ClaudePick component does NOT auto-fetch by default.
 * 3. Single AI entry per WeekPlanner day (handleAskClaude is the sole AI hook).
 * 4. Reset button labels are explicit ("Reset slot", "Reset outfit", "Reset watch").
 * 5. WardrobeGrid exposes per-card delete via a stable handler shape.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../src/outfitEngine/strapRecommender.js", () => ({
  recommendStrap: () => null,
}));

const { buildOutfit } = await import("../src/outfitEngine/outfitBuilder.js");

// ── Issue 1 — sweater fallback safety ────────────────────────────────────────
describe("UX fixes Apr 2026 — sweater fallback", () => {
  const watch = {
    id: "w1", label: "Santos", dial: "white", strap: "brown leather",
    formality: 6, straps: [{ id: "brown", label: "Brown leather", color: "brown", type: "leather" }],
  };
  const wardrobe = [
    { id: "s1", type: "shirt",   name: "White oxford",  color: "white", formality: 6 },
    { id: "p1", type: "pants",   name: "Navy chinos",   color: "navy",  formality: 5 },
    { id: "sh1", type: "shoes",  name: "Brown loafers", color: "brown", formality: 6 },
    { id: "sw1", type: "sweater", name: "Grey cashmere", color: "grey", formality: 7 },
  ];

  it("weather=null → no sweater", () => {
    const result = buildOutfit(watch, wardrobe, null, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("weather=undefined → no sweater (22°C neutral-warm fallback)", () => {
    const result = buildOutfit(watch, wardrobe, undefined, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("weather={} (empty object) → no sweater (tempC missing → fallback)", () => {
    const result = buildOutfit(watch, wardrobe, {}, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("weather={tempC:25} → no sweater (warm)", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 25 }, [], 5, "smart-casual");
    expect(result.sweater).toBeNull();
  });

  it("weather={tempC:10} → sweater present (cold)", () => {
    const result = buildOutfit(watch, wardrobe, { tempC: 10 }, [], 5, "smart-casual");
    expect(result.sweater).not.toBeNull();
  });
});

// ── Issue 2 — ClaudePick is opt-in (no auto-fetch on mount) ──────────────────
describe("UX fixes Apr 2026 — ClaudePick opt-in", () => {
  it("default render does not call /.netlify/functions/daily-pick", async () => {
    // Static check of the default prop value — we don't mount React here, but
    // we assert the default prop is `false` so the component won't auto-fetch.
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/ClaudePick.jsx", "utf-8")
    );
    expect(src).toMatch(/autoFetch\s*=\s*false/);
    // The fetchPick call is gated behind `if (autoFetch) fetchPick();`
    expect(src).toMatch(/if\s*\(\s*autoFetch\s*\)\s*fetchPick\(\)/);
  });

  it("file contains the explicit Ask-Claude CTA wording", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/ClaudePick.jsx", "utf-8")
    );
    expect(src).toMatch(/Ask Claude/);
  });
});

// ── Issue 3 — single AI hook in WeekPlanner ─────────────────────────────────
describe("UX fixes Apr 2026 — WeekPlanner single AI entry point", () => {
  it("WeekPlanner has exactly one /.netlify/functions/daily-pick fetch (handleAskClaude)", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WeekPlanner.jsx", "utf-8")
    );
    const matches = src.match(/\/\.netlify\/functions\/daily-pick/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("AI badge only renders when aiAppliedDays contains the day's date", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WeekPlanner.jsx", "utf-8")
    );
    expect(src).toMatch(/aiAppliedDays\.has\(day\.date\)/);
    expect(src).toMatch(/✦\s*AI/);
  });
});

// ── Issue 4 — explicit reset button labels ──────────────────────────────────
describe("UX fixes Apr 2026 — Reset button labels", () => {
  it("WatchDashboard uses 'Reset slot' (per-slot) and 'Reset outfit' (top-level)", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WatchDashboard.jsx", "utf-8")
    );
    expect(src).toMatch(/Reset slot/);
    expect(src).toMatch(/Reset outfit/);
    // Old bare "Reset" label should be gone from this file (we kept only labelled variants)
    expect(src).not.toMatch(/>\s*Reset\s*</);
  });

  it("WeekPlanner uses 'Reset watch' and 'Reset outfit' (no bare 'Reset')", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WeekPlanner.jsx", "utf-8")
    );
    expect(src).toMatch(/Reset watch/);
    expect(src).toMatch(/Reset outfit/);
    expect(src).not.toMatch(/>\s*Reset\s*</);
  });
});

// ── Issue 5 — WardrobeGrid per-card delete ──────────────────────────────────
describe("UX fixes Apr 2026 — WardrobeGrid per-card delete", () => {
  it("Cell receives onDelete in cellData and renders a delete button outside select mode", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WardrobeGrid.jsx", "utf-8")
    );
    expect(src).toMatch(/onDelete:\s*handleSingleDelete/);
    expect(src).toMatch(/onDelete\?\.\(item\)/);
    expect(src).toMatch(/aria-label=\{`Delete \$\{item\.name/);
  });

  it("handleSingleDelete confirms via window.confirm before removing", async () => {
    const src = await import("node:fs").then(fs =>
      fs.promises.readFile("src/components/WardrobeGrid.jsx", "utf-8")
    );
    expect(src).toMatch(/window\.confirm\?\.\(/);
    expect(src).toMatch(/removeGarment\(item\.id\)/);
    expect(src).toMatch(/deleteGarment\(item\.id\)/);
    expect(src).toMatch(/deleteStoragePhoto\(item\.id\)/);
  });
});
