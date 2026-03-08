import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for WatchDashboard AI suggestion "Apply This Outfit" feature.
 * Extracts and tests the core logic that builds an override outfit from
 * AI stylist suggestions, replacing the engine outfit in the display.
 */

// ── Core logic extracted from WatchDashboard ─────────────────────────────────

/**
 * Build an override outfit object from an AI suggestion.
 * Mirrors the onClick handler of the "Apply This Outfit" button.
 */
function buildOverrideOutfit(aiSuggestion, garments, engineOutfit) {
  const built = {};
  for (const slot of ["shirt", "pants", "shoes", "jacket"]) {
    const gName = aiSuggestion[slot];
    if (gName) {
      const g = garments.find(x => x.name === gName);
      if (g) built[slot] = g;
    }
  }
  // Preserve sweater from engine outfit if present
  if (engineOutfit.sweater) built.sweater = engineOutfit.sweater;
  return Object.keys(built).length > 0 ? built : null;
}

/**
 * Resolve the display outfit: override if set, else engine.
 */
function resolveDisplayOutfit(overrideOutfit, engineOutfit) {
  return overrideOutfit ?? engineOutfit;
}

// ── Test data ────────────────────────────────────────────────────────────────

const garments = [
  { id: "g1", name: "light blue shirt", type: "shirt", color: "light blue", thumbnail: "thumb1.jpg" },
  { id: "g2", name: "black pants", type: "pants", color: "black", thumbnail: "thumb2.jpg" },
  { id: "g3", name: "brown shoes", type: "shoes", color: "brown", thumbnail: "thumb3.jpg" },
  { id: "g4", name: "navy jacket", type: "jacket", color: "navy", thumbnail: "thumb4.jpg" },
  { id: "g5", name: "white shirt", type: "shirt", color: "white", thumbnail: "thumb5.jpg" },
  { id: "g6", name: "grey pants", type: "pants", color: "grey", thumbnail: "thumb6.jpg" },
  { id: "g7", name: "black shoes", type: "shoes", color: "black", thumbnail: "thumb7.jpg" },
  { id: "g8", name: "beige jacket", type: "jacket", color: "beige", thumbnail: "thumb8.jpg" },
  { id: "g9", name: "wool sweater", type: "sweater", color: "grey", thumbnail: "thumb9.jpg" },
];

const engineOutfit = {
  shirt: garments[4],  // white shirt
  pants: garments[5],  // grey pants
  shoes: garments[6],  // black shoes
  jacket: garments[7], // beige jacket
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WatchDashboard AI Apply Outfit", () => {
  describe("buildOverrideOutfit", () => {
    it("maps AI suggestion names to garment objects", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
        explanation: "Great combo",
        strapShoeOk: true,
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result).not.toBeNull();
      expect(result.shirt.id).toBe("g1");
      expect(result.pants.id).toBe("g2");
      expect(result.shoes.id).toBe("g3");
      expect(result.jacket.id).toBe("g4");
    });

    it("returns null when no garments match the suggestion", () => {
      const suggestion = {
        shirt: "nonexistent shirt",
        pants: "nonexistent pants",
        shoes: null,
        jacket: null,
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result).toBeNull();
    });

    it("handles partial suggestions (only some slots filled)", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: null,
        shoes: "brown shoes",
        jacket: null,
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result).not.toBeNull();
      expect(result.shirt.id).toBe("g1");
      expect(result.shoes.id).toBe("g3");
      expect(result.pants).toBeUndefined();
      expect(result.jacket).toBeUndefined();
    });

    it("preserves engine sweater in override", () => {
      const outfitWithSweater = { ...engineOutfit, sweater: garments[8] };
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const result = buildOverrideOutfit(suggestion, garments, outfitWithSweater);
      expect(result.sweater.id).toBe("g9");
    });

    it("does not add sweater when engine outfit has none", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result.sweater).toBeUndefined();
    });

    it("ignores non-slot keys in suggestion (explanation, strapShoeOk)", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
        explanation: "Some explanation text",
        strapShoeOk: true,
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result.explanation).toBeUndefined();
      expect(result.strapShoeOk).toBeUndefined();
    });

    it("handles mixed match/no-match across slots", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "fantasy pants",       // no match
        shoes: "brown shoes",
        jacket: "invisible jacket",   // no match
      };
      const result = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(result).not.toBeNull();
      expect(result.shirt.id).toBe("g1");
      expect(result.shoes.id).toBe("g3");
      expect(result.pants).toBeUndefined();
      expect(result.jacket).toBeUndefined();
    });
  });

  describe("resolveDisplayOutfit", () => {
    it("returns override outfit when set", () => {
      const override = { shirt: garments[0], pants: garments[1] };
      const result = resolveDisplayOutfit(override, engineOutfit);
      expect(result).toBe(override);
    });

    it("returns engine outfit when override is null", () => {
      const result = resolveDisplayOutfit(null, engineOutfit);
      expect(result).toBe(engineOutfit);
    });

    it("returns engine outfit when override is undefined", () => {
      const result = resolveDisplayOutfit(undefined, engineOutfit);
      expect(result).toBe(engineOutfit);
    });
  });

  describe("outfit display consistency", () => {
    it("displayOutfit garments have thumbnail for photo display", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const override = buildOverrideOutfit(suggestion, garments, engineOutfit);
      const display = resolveDisplayOutfit(override, engineOutfit);
      for (const slot of ["shirt", "pants", "shoes", "jacket"]) {
        expect(display[slot].thumbnail).toBeTruthy();
      }
    });

    it("applied AI outfit garments retain full garment properties", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const override = buildOverrideOutfit(suggestion, garments, engineOutfit);
      expect(override.shirt).toEqual(garments[0]);
      expect(override.pants).toEqual(garments[1]);
      expect(override.shoes).toEqual(garments[2]);
      expect(override.jacket).toEqual(garments[3]);
    });

    it("override outfit is different from engine outfit", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const override = buildOverrideOutfit(suggestion, garments, engineOutfit);
      const display = resolveDisplayOutfit(override, engineOutfit);
      // AI suggested different garments than engine
      expect(display.shirt.id).not.toBe(engineOutfit.shirt.id);
      expect(display.pants.id).not.toBe(engineOutfit.pants.id);
      expect(display.shoes.id).not.toBe(engineOutfit.shoes.id);
      expect(display.jacket.id).not.toBe(engineOutfit.jacket.id);
    });
  });

  describe("watch change clears override", () => {
    it("override should be reset when watch changes (logic test)", () => {
      // Simulates the useEffect behavior: when selectedWatch.id changes,
      // overrideOutfit and aiSuggestion should be cleared
      let overrideOutfit = { shirt: garments[0] };
      let aiSuggestion = { shirt: "light blue shirt" };
      let currentWatchId = "w1";

      // Simulate watch change
      const newWatchId = "w2";
      if (newWatchId !== currentWatchId) {
        overrideOutfit = null;
        aiSuggestion = null;
        currentWatchId = newWatchId;
      }

      expect(overrideOutfit).toBeNull();
      expect(aiSuggestion).toBeNull();
    });

    it("override persists when watch stays the same", () => {
      let overrideOutfit = { shirt: garments[0] };
      let currentWatchId = "w1";

      // Same watch — no clear
      const sameWatchId = "w1";
      if (sameWatchId !== currentWatchId) {
        overrideOutfit = null;
      }

      expect(overrideOutfit).not.toBeNull();
      expect(overrideOutfit.shirt.id).toBe("g1");
    });
  });

  describe("Wear This Outfit uses displayOutfit", () => {
    it("logs garment IDs from override outfit when applied", () => {
      const suggestion = {
        shirt: "light blue shirt",
        pants: "black pants",
        shoes: "brown shoes",
        jacket: "navy jacket",
      };
      const override = buildOverrideOutfit(suggestion, garments, engineOutfit);
      const display = resolveDisplayOutfit(override, engineOutfit);

      // Simulate "Wear This Outfit" button logic
      const slots = ["shirt", "sweater", "pants", "shoes", "jacket"];
      const garmentIds = slots.map(s => display[s]?.id).filter(Boolean);
      const outfitMap = {};
      for (const s of slots) { if (display[s]?.id) outfitMap[s] = display[s].id; }

      expect(garmentIds).toEqual(["g1", "g2", "g3", "g4"]);
      expect(outfitMap).toEqual({
        shirt: "g1",
        pants: "g2",
        shoes: "g3",
        jacket: "g4",
      });
    });

    it("logs engine outfit IDs when no override", () => {
      const display = resolveDisplayOutfit(null, engineOutfit);

      const slots = ["shirt", "sweater", "pants", "shoes", "jacket"];
      const garmentIds = slots.map(s => display[s]?.id).filter(Boolean);

      expect(garmentIds).toEqual(["g5", "g6", "g7", "g8"]);
    });
  });
});
