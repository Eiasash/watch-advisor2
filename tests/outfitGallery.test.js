import { describe, it, expect } from "vitest";

// ── Replicated pure functions from OutfitGallery.jsx ────────────────────────

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

/** Build photo items from garments + history (replicated logic) */
function buildPhotoItems(garments, entries, watches) {
  const out = [];

  // 1. Standalone outfit photos
  const outfitPhotos = garments.filter(g =>
    g.type === "outfit-photo" || g.type === "outfit-shot" || g.excludeFromWardrobe
  );
  for (const g of outfitPhotos) {
    const src = g.thumbnail || g.photoUrl;
    if (!src) continue;
    out.push({
      id: `wardrobe-${g.id}`,
      src,
      date: g.lastWorn ?? null,
      label: g.name ?? "Outfit photo",
      source: "wardrobe",
    });
  }

  // 2. History entry photos
  for (const e of entries) {
    const watch = watches.find(w => w.id === e.watchId);
    const wornGarments = (e.garmentIds ?? [])
      .map(id => garments.find(g => g.id === id))
      .filter(Boolean);

    const photos = [
      e.outfitPhoto ? { src: e.outfitPhoto, idx: 0 } : null,
      ...(e.outfitPhotos ?? []).map((s, i) => s ? { src: s, idx: i } : null),
    ].filter(Boolean);

    for (const p of photos) {
      out.push({
        id: `history-${e.id}-${p.idx}`,
        src: p.src,
        date: e.date,
        label: watch ? `${watch.brand} ${watch.model}` : "Logged outfit",
        source: "history",
      });
    }
  }

  return out.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

/** Filter logic replicated from OutfitGallery */
function filterItems(items, filter) {
  if (filter === "all") return items;
  if (filter === "logged") return items.filter(i => i.source === "history");
  return items.filter(i => i.source === "wardrobe");
}

// ── formatDate ──────────────────────────────────────────────────────────────

describe("OutfitGallery — formatDate", () => {
  it("formats ISO date string correctly", () => {
    const result = formatDate("2026-03-01");
    expect(result).toMatch(/1 Mar 2026/);
  });

  it("returns empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });
});

// ── buildPhotoItems ─────────────────────────────────────────────────────────

describe("OutfitGallery — buildPhotoItems", () => {
  const watches = [
    { id: "w1", brand: "Omega", model: "Seamaster" },
  ];

  it("returns empty array for no garments and no entries", () => {
    expect(buildPhotoItems([], [], watches)).toEqual([]);
  });

  it("includes standalone outfit-photo garments", () => {
    const garments = [
      { id: "g1", type: "outfit-photo", thumbnail: "thumb1.jpg", name: "Monday outfit" },
    ];
    const items = buildPhotoItems(garments, [], watches);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("wardrobe");
    expect(items[0].label).toBe("Monday outfit");
  });

  it("includes outfit-shot garments", () => {
    const garments = [
      { id: "g2", type: "outfit-shot", thumbnail: "thumb2.jpg" },
    ];
    const items = buildPhotoItems(garments, [], watches);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("wardrobe");
  });

  it("includes excludeFromWardrobe garments with photos", () => {
    const garments = [
      { id: "g3", type: "shirt", excludeFromWardrobe: true, thumbnail: "thumb3.jpg" },
    ];
    const items = buildPhotoItems(garments, [], watches);
    expect(items).toHaveLength(1);
  });

  it("skips garments without thumbnail or photoUrl", () => {
    const garments = [
      { id: "g4", type: "outfit-photo" }, // no thumbnail or photoUrl
    ];
    const items = buildPhotoItems(garments, [], watches);
    expect(items).toHaveLength(0);
  });

  it("includes history entry photos with watch labels", () => {
    const entries = [
      { id: "e1", watchId: "w1", date: "2026-03-01", outfitPhoto: "photo1.jpg" },
    ];
    const items = buildPhotoItems([], entries, watches);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe("history");
    expect(items[0].label).toBe("Omega Seamaster");
    expect(items[0].date).toBe("2026-03-01");
  });

  it("shows 'Logged outfit' when watch not found", () => {
    const entries = [
      { id: "e2", watchId: "unknown", date: "2026-03-01", outfitPhoto: "photo.jpg" },
    ];
    const items = buildPhotoItems([], entries, watches);
    expect(items[0].label).toBe("Logged outfit");
  });

  it("includes multiple outfitPhotos from a single entry", () => {
    const entries = [
      { id: "e3", watchId: "w1", date: "2026-03-02", outfitPhotos: ["p1.jpg", "p2.jpg"] },
    ];
    const items = buildPhotoItems([], entries, watches);
    expect(items).toHaveLength(2);
  });

  it("sorts items newest first", () => {
    const garments = [
      { id: "g1", type: "outfit-photo", thumbnail: "t.jpg", lastWorn: "2026-01-01" },
    ];
    const entries = [
      { id: "e1", watchId: "w1", date: "2026-03-01", outfitPhoto: "p.jpg" },
    ];
    const items = buildPhotoItems(garments, entries, watches);
    expect(items[0].date).toBe("2026-03-01"); // newer first
    expect(items[1].date).toBe("2026-01-01");
  });

  it("items without dates sort to end", () => {
    const garments = [
      { id: "g1", type: "outfit-photo", thumbnail: "t.jpg" }, // no date
    ];
    const entries = [
      { id: "e1", watchId: "w1", date: "2026-03-01", outfitPhoto: "p.jpg" },
    ];
    const items = buildPhotoItems(garments, entries, watches);
    expect(items[0].date).toBe("2026-03-01");
    expect(items[1].date).toBeNull();
  });
});

// ── filterItems ─────────────────────────────────────────────────────────────

describe("OutfitGallery — filterItems", () => {
  const items = [
    { id: "1", source: "wardrobe" },
    { id: "2", source: "history" },
    { id: "3", source: "wardrobe" },
    { id: "4", source: "history" },
  ];

  it("'all' returns all items", () => {
    expect(filterItems(items, "all")).toHaveLength(4);
  });

  it("'logged' returns only history items", () => {
    const result = filterItems(items, "logged");
    expect(result).toHaveLength(2);
    result.forEach(i => expect(i.source).toBe("history"));
  });

  it("'wardrobe' returns only wardrobe items", () => {
    const result = filterItems(items, "wardrobe");
    expect(result).toHaveLength(2);
    result.forEach(i => expect(i.source).toBe("wardrobe"));
  });
});
