import { describe, it, expect } from "vitest";

// ── Replicated pure search/filter logic from CommandPalette.jsx ──────────────

const ACTIONS = [
  { id: "act-settings", label: "Open Settings", icon: "\u2699", action: "settings" },
  { id: "act-export-json", label: "Export Data (JSON)", icon: "\u21E9", action: "export-json" },
  { id: "act-export-csv", label: "Export Data (CSV)", icon: "\u21E9", action: "export-csv" },
  { id: "act-theme", label: "Toggle Day/Night Mode", icon: "\u263E", action: "toggle-theme" },
  { id: "act-top", label: "Scroll to Top", icon: "\u2191", action: "scroll-top" },
];

function computeResults(query, watches, garments, dbGarments) {
  const q = query.toLowerCase().trim();
  const out = [];

  // Watches
  const matchedWatches = watches.filter(w =>
    !q || [w.brand, w.model, w.ref, w.dial, w.style].some(f => f?.toLowerCase().includes(q))
  ).slice(0, 6);
  if (matchedWatches.length > 0) {
    out.push({ type: "header", label: "Watches" });
    matchedWatches.forEach(w => out.push({
      type: "watch", id: w.id, label: `${w.brand} ${w.model}`, data: w,
    }));
  }

  // Garments — merge local with DB, deduplicate by id
  const activeGarments = garments.filter(g => g && !g.excludeFromWardrobe);
  const localMatched = activeGarments.filter(g =>
    !q || [g.name, g.type, g.color, g.originalFilename].some(f => f?.toLowerCase().includes(q))
  );
  const localIds = new Set(localMatched.map(g => g.id));
  const dbOnly = (dbGarments || []).filter(g => !localIds.has(g.id));
  const merged = [...localMatched, ...dbOnly].slice(0, 8);

  if (merged.length > 0) {
    out.push({ type: "header", label: "Garments" });
    merged.forEach(g => out.push({
      type: "garment", id: g.id, label: g.name, data: g,
    }));
  }

  // Actions
  const matchedActions = ACTIONS.filter(a =>
    !q || a.label.toLowerCase().includes(q)
  );
  if (matchedActions.length > 0) {
    out.push({ type: "header", label: "Actions" });
    matchedActions.forEach(a => out.push({ type: "action", ...a }));
  }

  return out;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const watches = [
  { id: "w1", brand: "Rolex", model: "Submariner", ref: "126610LN", dial: "black", style: "sport" },
  { id: "w2", brand: "Omega", model: "Speedmaster", ref: "3861", dial: "black", style: "sport" },
  { id: "w3", brand: "Cartier", model: "Santos", ref: "WSSA0018", dial: "white", style: "dress" },
  { id: "w4", brand: "Tudor", model: "BB58", ref: "M79030N", dial: "blue", style: "sport" },
  { id: "w5", brand: "IWC", model: "Pilot", ref: "IW327015", dial: "blue", style: "aviator" },
  { id: "w6", brand: "Panerai", model: "Luminor", ref: "PAM01312", dial: "blue", style: "sport" },
  { id: "w7", brand: "Breitling", model: "Navitimer", ref: "AB0121", dial: "black", style: "aviator" },
];

const garments = [
  { id: "g1", name: "Navy Shirt", type: "shirt", color: "navy", originalFilename: "img_001.jpg" },
  { id: "g2", name: "Black Pants", type: "pants", color: "black", originalFilename: "img_002.jpg" },
  { id: "g3", name: "Brown Loafers", type: "shoes", color: "brown", originalFilename: "img_003.jpg" },
  { id: "g4", name: "Grey Blazer", type: "jacket", color: "grey", originalFilename: "img_004.jpg" },
  { id: "g5", name: "Excluded Item", type: "shirt", color: "white", excludeFromWardrobe: true },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CommandPalette — computeResults", () => {
  it("empty query returns all watches, garments, and actions", () => {
    const result = computeResults("", watches, garments, []);
    const headers = result.filter(r => r.type === "header").map(r => r.label);
    expect(headers).toContain("Watches");
    expect(headers).toContain("Garments");
    expect(headers).toContain("Actions");
    // All 5 actions present
    const actions = result.filter(r => r.type === "action");
    expect(actions).toHaveLength(5);
  });

  it("filters watches by brand", () => {
    const result = computeResults("rolex", watches, garments, []);
    const watchResults = result.filter(r => r.type === "watch");
    expect(watchResults).toHaveLength(1);
    expect(watchResults[0].id).toBe("w1");
  });

  it("filters watches by dial color", () => {
    const result = computeResults("blue", watches, garments, []);
    const watchResults = result.filter(r => r.type === "watch");
    // w4 (blue dial), w5 (blue dial), w6 (blue dial) = 3 watches
    expect(watchResults).toHaveLength(3);
  });

  it("filters garments by name", () => {
    const result = computeResults("navy shirt", watches, garments, []);
    const garmentResults = result.filter(r => r.type === "garment");
    expect(garmentResults.some(g => g.id === "g1")).toBe(true);
  });

  it("filters garments by type", () => {
    const result = computeResults("pants", watches, garments, []);
    const garmentResults = result.filter(r => r.type === "garment");
    expect(garmentResults.some(g => g.id === "g2")).toBe(true);
  });

  it("filters actions by label", () => {
    const result = computeResults("export", watches, garments, []);
    const actionResults = result.filter(r => r.type === "action");
    expect(actionResults).toHaveLength(2); // JSON + CSV
    expect(actionResults.every(a => a.label.toLowerCase().includes("export"))).toBe(true);
  });

  it("deduplicates garments (local + db with same id)", () => {
    const dbGarments = [
      { id: "g1", name: "Navy Shirt (cloud)", type: "shirt", color: "navy" },
      { id: "g99", name: "Cloud Only Item", type: "shirt", color: "blue" },
    ];
    const result = computeResults("", watches, garments, dbGarments);
    const garmentResults = result.filter(r => r.type === "garment");
    // g1 should appear only once (local version), g99 from db should be added
    const g1Count = garmentResults.filter(g => g.id === "g1").length;
    expect(g1Count).toBe(1);
    expect(garmentResults.some(g => g.id === "g99")).toBe(true);
  });

  it("returns max 6 watches", () => {
    const result = computeResults("", watches, [], []);
    const watchResults = result.filter(r => r.type === "watch");
    expect(watchResults.length).toBeLessThanOrEqual(6);
  });

  it("returns max 8 garments", () => {
    // Create 12 garments
    const manyGarments = Array.from({ length: 12 }, (_, i) => ({
      id: `gx${i}`, name: `Garment ${i}`, type: "shirt", color: "navy",
    }));
    const result = computeResults("", [], manyGarments, []);
    const garmentResults = result.filter(r => r.type === "garment");
    expect(garmentResults.length).toBeLessThanOrEqual(8);
  });

  it("excludes garments with excludeFromWardrobe", () => {
    const result = computeResults("", [], garments, []);
    const garmentResults = result.filter(r => r.type === "garment");
    expect(garmentResults.some(g => g.id === "g5")).toBe(false);
  });
});
