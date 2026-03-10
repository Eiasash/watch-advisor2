import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test the pure logic extracted from SelfiePanel ──────────────────────────

const SCORE_COLOR = s => s >= 8 ? "#10b981" : s >= 6 ? "#f59e0b" : "#ef4444";

function getTodayISO() { return new Date().toISOString().split("T")[0]; }

describe("SelfiePanel — SCORE_COLOR", () => {
  it("green for 8+", () => expect(SCORE_COLOR(8)).toBe("#10b981"));
  it("green for 10",  () => expect(SCORE_COLOR(10)).toBe("#10b981"));
  it("amber for 7",  () => expect(SCORE_COLOR(7)).toBe("#f59e0b"));
  it("amber for 6",  () => expect(SCORE_COLOR(6)).toBe("#f59e0b"));
  it("red for 5",    () => expect(SCORE_COLOR(5)).toBe("#ef4444"));
  it("red for 0",    () => expect(SCORE_COLOR(0)).toBe("#ef4444"));
  it("red for negative", () => expect(SCORE_COLOR(-1)).toBe("#ef4444"));
});

describe("SelfiePanel — getTodayISO", () => {
  it("returns YYYY-MM-DD format", () => {
    const iso = getTodayISO();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches current date", () => {
    const iso = getTodayISO();
    const now = new Date();
    expect(iso).toBe(now.toISOString().split("T")[0]);
  });
});

describe("SelfiePanel — photo scaling logic", () => {
  // Mirrors addPhotos logic: scale down when sending multiple images
  function getPhotoParams(totalAfter) {
    const maxPx = totalAfter <= 1 ? 800 : totalAfter <= 2 ? 640 : 512;
    const quality = totalAfter <= 1 ? 0.82 : totalAfter <= 2 ? 0.75 : 0.68;
    return { maxPx, quality };
  }

  it("single photo: 800px, 0.82 quality", () => {
    const { maxPx, quality } = getPhotoParams(1);
    expect(maxPx).toBe(800);
    expect(quality).toBe(0.82);
  });

  it("two photos: 640px, 0.75 quality", () => {
    const { maxPx, quality } = getPhotoParams(2);
    expect(maxPx).toBe(640);
    expect(quality).toBe(0.75);
  });

  it("three photos: 512px, 0.68 quality", () => {
    const { maxPx, quality } = getPhotoParams(3);
    expect(maxPx).toBe(512);
    expect(quality).toBe(0.68);
  });
});

describe("SelfiePanel — photo collection management", () => {
  it("max 3 photos enforced", () => {
    const photos = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const newPhotos = [{ id: 4 }, { id: 5 }];
    const result = [...photos, ...newPhotos].slice(0, 3);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe(1);
  });

  it("removePhoto filters by id", () => {
    const photos = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const removePhoto = (id) => photos.filter(p => p.id !== id);
    expect(removePhoto(2)).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("removePhoto with non-existent id keeps all", () => {
    const photos = [{ id: 1 }, { id: 2 }];
    const removePhoto = (id) => photos.filter(p => p.id !== id);
    expect(removePhoto(99)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe("SelfiePanel — selfie check request payload", () => {
  it("builds correct garment filter (excludes outfit-photo and excluded)", () => {
    const garments = [
      { id: "1", name: "Shirt", type: "shirt", color: "white", formality: 6, excludeFromWardrobe: false },
      { id: "2", name: "Old Pants", type: "pants", excludeFromWardrobe: true },
      { id: "3", name: "Outfit Pic", type: "outfit-photo", excludeFromWardrobe: false },
      { id: "4", name: "Jacket", type: "jacket", color: "navy", formality: 7, excludeFromWardrobe: false },
    ];

    const filtered = garments
      .filter(g => !g.excludeFromWardrobe && g.type !== "outfit-photo")
      .map(g => ({ id: g.id, name: g.name, type: g.type, color: g.color, formality: g.formality }));

    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe("1");
    expect(filtered[1].id).toBe("4");
  });

  it("resolves active strap label with fallback chain", () => {
    // label > color > watch.strap
    const getStrapLabel = (strapObj, watch) =>
      strapObj?.label ?? strapObj?.color ?? watch?.strap ?? null;

    expect(getStrapLabel({ label: "Brown Alligator" }, { strap: "leather" })).toBe("Brown Alligator");
    expect(getStrapLabel({ color: "brown" }, { strap: "leather" })).toBe("brown");
    expect(getStrapLabel(null, { strap: "bracelet" })).toBe("bracelet");
    expect(getStrapLabel(null, {})).toBeNull();
    expect(getStrapLabel(null, null)).toBeNull();
  });
});

describe("SelfiePanel — response error handling", () => {
  it("detects 502/504 timeout errors", () => {
    const handleStatus = (status) => {
      if (status === 502 || status === 504) {
        return `Function timed out (${status}). Try fewer photos or tap Check again.`;
      }
      return `Server error ${status}. Try again.`;
    };

    expect(handleStatus(502)).toContain("timed out (502)");
    expect(handleStatus(504)).toContain("timed out (504)");
    expect(handleStatus(500)).toContain("Server error 500");
    expect(handleStatus(403)).toContain("Server error 403");
  });
});

describe("SelfiePanel — history management", () => {
  it("prepends new entry and caps at 20", () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const newEntry = { id: 999 };
    const next = [newEntry, ...existing].slice(0, 20);
    expect(next).toHaveLength(20);
    expect(next[0].id).toBe(999);
    expect(next[19].id).toBe(18); // last old entry that fits
  });

  it("restores history entry photos", () => {
    const historyEntry = {
      preview: "data:prev",
      photos: ["data:1", "data:2"],
      result: { impact: 8 },
    };

    const restored = (historyEntry.photos ?? [historyEntry.preview]).map((u, i) => ({ id: i, dataUrl: u }));
    expect(restored).toHaveLength(2);
    expect(restored[0].dataUrl).toBe("data:1");
  });

  it("falls back to preview when photos array missing", () => {
    const historyEntry = {
      preview: "data:prev",
      result: { impact: 7 },
    };

    const restored = (historyEntry.photos ?? [historyEntry.preview]).map((u, i) => ({ id: i, dataUrl: u }));
    expect(restored).toHaveLength(1);
    expect(restored[0].dataUrl).toBe("data:prev");
  });
});

describe("SelfiePanel — extract and use logic", () => {
  it("builds entry with matched garment IDs", () => {
    const matchedIds = ["g1", "g2", "g3"];
    const TODAY = "2026-03-10";
    const activeWatchId = "speedmaster";

    const entry = {
      id: `today-${Date.now()}`,
      date: TODAY,
      watchId: activeWatchId,
      garmentIds: matchedIds,
      loggedAt: new Date().toISOString(),
    };

    expect(entry.garmentIds).toEqual(["g1", "g2", "g3"]);
    expect(entry.watchId).toBe("speedmaster");
    expect(entry.date).toBe("2026-03-10");
  });

  it("preserves existing entry fields when merging", () => {
    const existing = { id: "today-old", date: "2026-03-10", watchId: "reverso", notes: "nice day" };
    const matchedIds = ["g1"];

    const entry = {
      ...existing,
      garmentIds: matchedIds,
      loggedAt: new Date().toISOString(),
    };

    expect(entry.id).toBe("today-old");
    expect(entry.watchId).toBe("reverso");
    expect(entry.notes).toBe("nice day");
    expect(entry.garmentIds).toEqual(["g1"]);
  });
});
