import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DOM APIs ────────────────────────────────────────────────────────────

const mockClick = vi.fn();
const mockCreateObjectURL = vi.fn(() => "blob:test");
const mockRevokeObjectURL = vi.fn();

globalThis.URL = { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL };
globalThis.Blob = class Blob {
  constructor(parts, opts) { this.parts = parts; this.type = opts?.type; }
};
globalThis.document = {
  createElement: vi.fn(() => ({ click: mockClick, href: "", download: "" })),
};

// ── Replicated pure export logic from SettingsPanel.jsx ──────────────────────

function saveBackup(garments, watches, history) {
  const ts = new Date();
  const label = ts.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  const data = {
    _backup: true,
    _version: 2,
    _savedAt: ts.toISOString(),
    _counts: { garments: garments.length, history: history.length, watches: watches.length },
    watches,
    garments: garments.map(g => ({ ...g })),
    history,
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wa2-backup-${label}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data; // return for testing
}

function exportData(garments, watches, history) {
  const data = {
    version: 2,
    watches,
    garments: garments.map(g => ({
      id: g.id, name: g.name, type: g.type, color: g.color,
      formality: g.formality, needsReview: g.needsReview,
      hash: g.hash ?? "",
      thumbnail: g.thumbnail ?? null,
      photoAngles: g.photoAngles ?? [],
      originalFilename: g.originalFilename ?? null,
      duplicateOf: g.duplicateOf ?? null,
      excludeFromWardrobe: g.excludeFromWardrobe ?? false,
    })),
    history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `watch-advisor-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data; // return for testing
}

function exportCSV(garments) {
  const header = "id,name,type,color,formality,needsReview";
  const rows = garments.map(g =>
    [g.id, `"${(g.name || "").replace(/"/g, '""')}"`, g.type, g.color, g.formality, g.needsReview].join(",")
  );
  const csv = [header, ...rows].join("\n");
  return csv;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const sampleWatches = [
  { id: "w1", brand: "Rolex", model: "Sub" },
  { id: "w2", brand: "Omega", model: "Speedy" },
];

const sampleGarments = [
  {
    id: "g1", name: "Navy Shirt", type: "shirt", color: "navy",
    formality: 6, needsReview: false, hash: "abc123",
    thumbnail: "data:image/jpeg;base64,thumb1",
    photoAngles: ["data:image/jpeg;base64,angle1"],
    originalFilename: "img_001.jpg",
    duplicateOf: null,
    excludeFromWardrobe: false,
  },
  {
    id: "g2", name: "Black Pants", type: "pants", color: "black",
    formality: 5, needsReview: true, hash: "def456",
    thumbnail: null,
    photoAngles: [],
    originalFilename: null,
    duplicateOf: "g1",
    excludeFromWardrobe: false,
  },
];

const sampleHistory = [
  { date: "2026-03-01", watchId: "w1", garmentIds: ["g1", "g2"] },
  { date: "2026-03-02", watchId: "w2", garmentIds: ["g1"] },
];

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPanel — saveBackup", () => {
  it("generates correct _version and _counts", () => {
    const data = saveBackup(sampleGarments, sampleWatches, sampleHistory);
    expect(data._version).toBe(2);
    expect(data._backup).toBe(true);
    expect(data._counts).toEqual({
      garments: 2,
      watches: 2,
      history: 2,
    });
    expect(data._savedAt).toBeTruthy();
  });

  it("includes watches, garments, and history", () => {
    const data = saveBackup(sampleGarments, sampleWatches, sampleHistory);
    expect(data.watches).toHaveLength(2);
    expect(data.garments).toHaveLength(2);
    expect(data.history).toHaveLength(2);
    expect(data.watches[0].id).toBe("w1");
    expect(data.garments[0].id).toBe("g1");
  });
});

describe("SettingsPanel — exportData", () => {
  it("maps garments correctly with all expected fields", () => {
    const data = exportData(sampleGarments, sampleWatches, sampleHistory);
    const g1 = data.garments[0];
    expect(g1.id).toBe("g1");
    expect(g1.name).toBe("Navy Shirt");
    expect(g1.type).toBe("shirt");
    expect(g1.color).toBe("navy");
    expect(g1.formality).toBe(6);
    expect(g1.needsReview).toBe(false);
    expect(g1.hash).toBe("abc123");
    expect(g1.originalFilename).toBe("img_001.jpg");
    expect(g1.duplicateOf).toBeNull();
    expect(g1.excludeFromWardrobe).toBe(false);
  });

  it("sets version 2", () => {
    const data = exportData(sampleGarments, sampleWatches, sampleHistory);
    expect(data.version).toBe(2);
  });

  it("preserves thumbnail and photoAngles", () => {
    const data = exportData(sampleGarments, sampleWatches, sampleHistory);
    expect(data.garments[0].thumbnail).toBe("data:image/jpeg;base64,thumb1");
    expect(data.garments[0].photoAngles).toEqual(["data:image/jpeg;base64,angle1"]);
    // null thumbnail preserved as null
    expect(data.garments[1].thumbnail).toBeNull();
    expect(data.garments[1].photoAngles).toEqual([]);
  });
});

describe("SettingsPanel — exportCSV", () => {
  it("generates correct header line", () => {
    const csv = exportCSV(sampleGarments);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,name,type,color,formality,needsReview");
  });

  it("escapes quotes in garment names", () => {
    const garments = [
      { id: "g1", name: 'Levi\'s "501" Jeans', type: "pants", color: "blue", formality: 3, needsReview: false },
    ];
    const csv = exportCSV(garments);
    const lines = csv.split("\n");
    // Double quotes inside should be escaped as ""
    expect(lines[1]).toContain('""501""');
  });

  it("handles empty garments array", () => {
    const csv = exportCSV([]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("id,name,type,color,formality,needsReview");
  });
});
