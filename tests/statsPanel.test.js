import { describe, it, expect } from "vitest";

// ── Replicated pure computation logic from StatsPanel.jsx ────────────────────

function computeWatchFreq(entries, watches, cutoff) {
  const filtered = entries.filter(e => (e.date ?? "") >= cutoff);
  const freq = {};
  filtered.forEach(e => { if (e.watchId) freq[e.watchId] = (freq[e.watchId] ?? 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, n, watch: watches.find(w => w.id === id) }))
    .filter(x => x.watch);
}

function computeColorFreq(entries, garments, cutoff) {
  const filtered = entries.filter(e => (e.date ?? "") >= cutoff);
  const garmentMap = {};
  garments.forEach(g => { garmentMap[g.id] = g; });
  const freq = {};
  filtered.forEach(e => {
    (e.garmentIds ?? []).forEach(gid => {
      const g = garmentMap[gid];
      if (g?.color) freq[g.color] = (freq[g.color] ?? 0) + 1;
    });
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
}

function computeStreak(entries) {
  const allDates = entries.map(e => e.date).filter(Boolean);
  const uniqueDates = [...new Set(allDates)].sort().reverse();
  let s = 0;
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = d.toISOString().split("T")[0];
    if (uniqueDates.includes(dk)) s++;
    else if (i === 0) continue;
    else break;
  }
  return s;
}

function computeColdBench(garments, entries) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return garments
    .filter(g => !g.excludeFromWardrobe && !["outfit-photo","outfit-shot","belt","sunglasses","hat","scarf","bag","accessory"].includes(g.type))
    .map(g => {
      const worn = entries.filter(e => (e.garmentIds ?? []).includes(g.id));
      const lastWorn = worn.length > 0 ? worn.sort((a,b) => b.date.localeCompare(a.date))[0].date : null;
      const daysSince = lastWorn ? Math.floor((Date.now() - new Date(lastWorn).getTime()) / 864e5) : 999;
      return { g, lastWorn, daysSince, wears: worn.length };
    })
    .filter(x => x.daysSince >= 30)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 8);
}

function computeCpw(garments, entries) {
  return garments
    .filter(g => g.price > 0)
    .map(g => {
      const wears = entries.filter(e => (e.garmentIds ?? []).includes(g.id)).length;
      if (!wears) return null;
      return { garment: g, wears, cpw: Math.round(g.price / wears) };
    })
    .filter(Boolean)
    .sort((a, b) => a.cpw - b.cpw)
    .slice(0, 8);
}

function computeContextFreq(entries, cutoff) {
  const filtered = entries.filter(e => (e.date ?? "") >= cutoff);
  const freq = {};
  filtered.forEach(e => { if (e.context) freq[e.context] = (freq[e.context] ?? 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("StatsPanel — computeWatchFreq", () => {
  const watches = [
    { id: "w1", brand: "Rolex", model: "Sub" },
    { id: "w2", brand: "Omega", model: "Speedy" },
    { id: "w3", brand: "Tudor", model: "BB" },
  ];

  it("counts watch frequency correctly", () => {
    const entries = [
      { date: daysAgo(1), watchId: "w1" },
      { date: daysAgo(2), watchId: "w1" },
      { date: daysAgo(3), watchId: "w2" },
    ];
    const result = computeWatchFreq(entries, watches, daysAgo(30));
    const w1 = result.find(x => x.id === "w1");
    const w2 = result.find(x => x.id === "w2");
    expect(w1.n).toBe(2);
    expect(w2.n).toBe(1);
  });

  it("sorts by count descending", () => {
    const entries = [
      { date: daysAgo(1), watchId: "w2" },
      { date: daysAgo(2), watchId: "w2" },
      { date: daysAgo(3), watchId: "w2" },
      { date: daysAgo(4), watchId: "w1" },
    ];
    const result = computeWatchFreq(entries, watches, daysAgo(30));
    expect(result[0].id).toBe("w2");
    expect(result[0].n).toBe(3);
    expect(result[1].id).toBe("w1");
    expect(result[1].n).toBe(1);
  });

  it("filters out unknown watch IDs", () => {
    const entries = [
      { date: daysAgo(1), watchId: "w1" },
      { date: daysAgo(2), watchId: "w-unknown" },
    ];
    const result = computeWatchFreq(entries, watches, daysAgo(30));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });

  it("respects cutoff date", () => {
    const entries = [
      { date: daysAgo(5), watchId: "w1" },
      { date: daysAgo(60), watchId: "w2" },
    ];
    const result = computeWatchFreq(entries, watches, daysAgo(30));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });
});

describe("StatsPanel — computeColorFreq", () => {
  const garments = [
    { id: "g1", color: "navy" },
    { id: "g2", color: "black" },
    { id: "g3", color: "navy" },
  ];

  it("counts colors from garment IDs", () => {
    const entries = [
      { date: daysAgo(1), garmentIds: ["g1", "g2"] },
      { date: daysAgo(2), garmentIds: ["g3"] },
    ];
    const result = computeColorFreq(entries, garments, daysAgo(30));
    const navy = result.find(([c]) => c === "navy");
    const black = result.find(([c]) => c === "black");
    expect(navy[1]).toBe(2);
    expect(black[1]).toBe(1);
  });

  it("limits to top 12 colors", () => {
    // Create 15 garments with distinct colors
    const manyGarments = Array.from({ length: 15 }, (_, i) => ({
      id: `gm${i}`, color: `color${i}`,
    }));
    const entries = manyGarments.map((g, i) => ({
      date: daysAgo(i + 1),
      garmentIds: [g.id],
    }));
    const result = computeColorFreq(entries, manyGarments, daysAgo(30));
    expect(result.length).toBeLessThanOrEqual(12);
  });
});

describe("StatsPanel — computeStreak", () => {
  it("counts consecutive days", () => {
    const entries = [
      { date: daysAgo(1) },
      { date: daysAgo(2) },
      { date: daysAgo(3) },
    ];
    const result = computeStreak(entries);
    expect(result).toBe(3);
  });

  it("gap breaks streak", () => {
    // Yesterday and 3 days ago (skip 2 days ago)
    const entries = [
      { date: daysAgo(1) },
      { date: daysAgo(3) },
    ];
    const result = computeStreak(entries);
    expect(result).toBe(1);
  });

  it("allows missing today (i===0 continue)", () => {
    // Yesterday and day before — no entry today
    const entries = [
      { date: daysAgo(1) },
      { date: daysAgo(2) },
    ];
    const result = computeStreak(entries);
    expect(result).toBe(2);
  });
});

describe("StatsPanel — computeColdBench", () => {
  it("identifies never-worn garments (999 days)", () => {
    const garments = [{ id: "g1", type: "shirt" }];
    const entries = [];
    const result = computeColdBench(garments, entries);
    expect(result).toHaveLength(1);
    expect(result[0].daysSince).toBe(999);
    expect(result[0].wears).toBe(0);
  });

  it("excludes accessories from cold bench", () => {
    const garments = [
      { id: "g1", type: "belt" },
      { id: "g2", type: "sunglasses" },
      { id: "g3", type: "hat" },
      { id: "g4", type: "scarf" },
      { id: "g5", type: "bag" },
      { id: "g6", type: "accessory" },
      { id: "g7", type: "outfit-photo" },
      { id: "g8", type: "outfit-shot" },
    ];
    const entries = [];
    const result = computeColdBench(garments, entries);
    expect(result).toHaveLength(0);
  });

  it("excludes items with excludeFromWardrobe flag", () => {
    const garments = [
      { id: "g1", type: "shirt", excludeFromWardrobe: true },
      { id: "g2", type: "pants" },
    ];
    const entries = [];
    const result = computeColdBench(garments, entries);
    expect(result).toHaveLength(1);
    expect(result[0].g.id).toBe("g2");
  });
});

describe("StatsPanel — computeCpw", () => {
  it("calculates cost per wear correctly", () => {
    const garments = [
      { id: "g1", price: 100 },
      { id: "g2", price: 200 },
    ];
    const entries = [
      { garmentIds: ["g1"] },
      { garmentIds: ["g1"] },
      { garmentIds: ["g2"] },
    ];
    const result = computeCpw(garments, entries);
    const g1 = result.find(x => x.garment.id === "g1");
    const g2 = result.find(x => x.garment.id === "g2");
    expect(g1.cpw).toBe(50);  // 100 / 2
    expect(g2.cpw).toBe(200); // 200 / 1
  });

  it("excludes zero-wear garments", () => {
    const garments = [
      { id: "g1", price: 100 },
      { id: "g2", price: 200 },
    ];
    const entries = [{ garmentIds: ["g1"] }];
    const result = computeCpw(garments, entries);
    expect(result).toHaveLength(1);
    expect(result[0].garment.id).toBe("g1");
  });
});

describe("StatsPanel — computeContextFreq", () => {
  it("aggregates context distribution", () => {
    const entries = [
      { date: daysAgo(1), context: "casual" },
      { date: daysAgo(2), context: "casual" },
      { date: daysAgo(3), context: "formal" },
      { date: daysAgo(4), context: "smart-casual" },
    ];
    const result = computeContextFreq(entries, daysAgo(30));
    expect(result[0][0]).toBe("casual");
    expect(result[0][1]).toBe(2);
    expect(result).toHaveLength(3);
  });
});
