import { describe, it, expect } from "vitest";
import { generateOutfit, explainOutfit, garmentScore } from "./helpers/legacyShim.js";
import { pickWatch, pickWatchPair } from "../src/engine/watchRotation.js";
import { inferDayProfile, scoreWatchForDay } from "../src/engine/dayProfile.js";
import { WATCH_COLLECTION } from "../src/data/watchSeed.js";

// ─── Shared fixtures ────────────────────────────────────────────────────────

const snowflake = WATCH_COLLECTION.find(w => w.id === "snowflake");
const laureato  = WATCH_COLLECTION.find(w => w.id === "laureato");
const reverso   = WATCH_COLLECTION.find(w => w.id === "reverso");
const blackbay  = WATCH_COLLECTION.find(w => w.id === "blackbay");

const baseWardrobe = [
  { id: "s1", type: "shirt",  name: "White Oxford",   color: "white",  formality: 7 },
  { id: "s2", type: "shirt",  name: "Navy Polo",       color: "navy",   formality: 6 },
  { id: "p1", type: "pants",  name: "Grey Trousers",   color: "grey",   formality: 7 },
  { id: "p2", type: "pants",  name: "Dark Chinos",     color: "brown",  formality: 5 },
  { id: "sh1",type: "shoes",  name: "Tan Eccos",       color: "tan",    formality: 6 },
  { id: "sh2",type: "shoes",  name: "Black Eccos",     color: "black",  formality: 7 },
  { id: "j1", type: "jacket", name: "Camel Coat",      color: "beige",  formality: 7 },
  { id: "j2", type: "jacket", name: "Green Zip",       color: "green",  formality: 5 },
];

// ─── Outfit engine ───────────────────────────────────────────────────────────

describe("outfit engine — slot assignment", () => {
  it("fills all four slots when wardrobe is complete", () => {
    const outfit = generateOutfit(snowflake, baseWardrobe, { tempC: 20 }, {}, []);
    expect(outfit.shirt).toBeTruthy();
    expect(outfit.pants).toBeTruthy();
    expect(outfit.shoes).toBeTruthy();
    expect(outfit.jacket).toBeTruthy();
  });

  it("returns null for slots with no garments (incomplete wardrobe safety)", () => {
    const partial = baseWardrobe.filter(g => g.type !== "jacket");
    const outfit = generateOutfit(snowflake, partial, { tempC: 20 }, {}, []);
    expect(outfit.jacket).toBeNull();
    expect(outfit.shirt).toBeTruthy();
  });

  it("prefers color-harmonious garments for Snowflake (silver-white dial)", () => {
    const outfit = generateOutfit(snowflake, baseWardrobe, { tempC: 20 }, {}, []);
    const compatColors = ["black", "navy", "grey", "white", "beige", "slate"];
    expect(compatColors).toContain(outfit.shirt.color);
  });

  it("applies diversity penalty for recently worn garments", () => {
    const history = [
      { watchId: "snowflake", outfit: { shirt: "s1", pants: "p1", shoes: "sh1", jacket: "j1" } },
      { watchId: "snowflake", outfit: { shirt: "s1", pants: "p1", shoes: "sh1", jacket: "j1" } },
      { watchId: "snowflake", outfit: { shirt: "s1", pants: "p1", shoes: "sh1", jacket: "j1" } },
      { watchId: "snowflake", outfit: { shirt: "s1", pants: "p1", shoes: "sh1", jacket: "j1" } },
      { watchId: "snowflake", outfit: { shirt: "s1", pants: "p1", shoes: "sh1", jacket: "j1" } },
    ];
    const outfit = generateOutfit(snowflake, baseWardrobe, { tempC: 20 }, {}, history);
    // With diversity penalty, s2 should beat s1 after 5 consecutive uses
    expect(outfit.shirt.id).toBe("s2");
  });

  it("suppresses jacket when temperature is high", () => {
    const hotWeather = { tempC: 32 };
    // Jacket score should be low — the engine still fills the slot but from lowest score
    const jacket_score_cold = garmentScore(snowflake, baseWardrobe.find(g => g.id === "j1"), { tempC: 10 }, []);
    const jacket_score_hot  = garmentScore(snowflake, baseWardrobe.find(g => g.id === "j1"), hotWeather, []);
    expect(jacket_score_cold).toBeGreaterThan(jacket_score_hot);
  });
});

describe("outfit engine — explanation", () => {
  it("returns a non-empty string", () => {
    const outfit = generateOutfit(snowflake, baseWardrobe, {}, {}, []);
    const why = explainOutfit(snowflake, outfit, "hospital-smart-casual");
    expect(typeof why).toBe("string");
    expect(why.length).toBeGreaterThan(20);
  });

  it("mentions the watch model", () => {
    const outfit = generateOutfit(snowflake, baseWardrobe, {}, {}, []);
    const why = explainOutfit(snowflake, outfit, "smart-casual");
    expect(why).toContain("Snowflake");
  });

  it("handles empty wardrobe gracefully", () => {
    const outfit = generateOutfit(snowflake, [], {}, {}, []);
    const why = explainOutfit(snowflake, outfit, "smart-casual");
    expect(why).toContain("No garments");
  });
});

// ─── Watch rotation ──────────────────────────────────────────────────────────

describe("watch rotation", () => {
  it("avoids watches worn in the last 7 entries", () => {
    // Pick exactly 7 watches to mark as recent; the remaining 6 should be eligible
    const avoidIds = WATCH_COLLECTION.slice(0, 7).map(w => w.id);
    const history = avoidIds.map(id => ({ watchId: id }));
    const picked = pickWatch(WATCH_COLLECTION, history, "smart-casual");
    // Should pick from the remaining (unworn) watches
    expect(avoidIds).not.toContain(picked.id);
  });

  it("falls back to full collection when all recently worn", () => {
    const history = WATCH_COLLECTION.map(w => ({ watchId: w.id }));
    const picked = pickWatch(WATCH_COLLECTION, history, "smart-casual");
    expect(picked).toBeTruthy();
  });

  it("returns a result even with empty history", () => {
    const picked = pickWatch(WATCH_COLLECTION, [], "smart-casual");
    expect(picked).toBeTruthy();
  });

  it("returns primary and backup pair", () => {
    const { primary, backup } = pickWatchPair(WATCH_COLLECTION, [], "smart-casual");
    expect(primary).toBeTruthy();
    expect(backup).toBeTruthy();
    expect(primary.id).not.toBe(backup.id);
  });

  it("handles single-watch collection without crashing", () => {
    const { primary, backup } = pickWatchPair([snowflake], [], "smart-casual");
    expect(primary).toBeTruthy();
    expect(backup).toBeNull();
  });
});

// ─── Day profile ─────────────────────────────────────────────────────────────

describe("day profile — inferDayProfile", () => {
  it("maps hospital events to hospital-smart-casual", () => {
    expect(inferDayProfile(["ward rounds", "consult"], {})).toBe("hospital-smart-casual");
    expect(inferDayProfile(["ICU duty"], {})).toBe("hospital-smart-casual");
    expect(inferDayProfile(["clinic session"], {})).toBe("hospital-smart-casual");
  });

  it("maps formal events to formal", () => {
    expect(inferDayProfile(["wedding ceremony"], {})).toBe("formal");
    expect(inferDayProfile(["Black Tie Gala"], {})).toBe("formal");
  });

  it("maps casual events correctly", () => {
    expect(inferDayProfile(["morning run"], {})).toBe("casual");
    expect(inferDayProfile(["beach day"], {})).toBe("casual");
  });

  it("maps travel events to travel", () => {
    expect(inferDayProfile(["flight to London"], {})).toBe("travel");
  });

  it("returns smart-casual for empty event list", () => {
    expect(inferDayProfile([], {})).toBe("smart-casual");
  });

  it("returns smart-casual for unrecognised events", () => {
    expect(inferDayProfile(["birthday party"], {})).toBe("smart-casual");
  });
});

describe("day profile — scoreWatchForDay", () => {
  it("scores Snowflake highly for hospital-smart-casual (sport-elegant, formality 7)", () => {
    const score = scoreWatchForDay(snowflake, "hospital-smart-casual", []);
    expect(score).toBeGreaterThan(0.6);
  });

  it("scores Reverso highly for formal (dress style, formality 9)", () => {
    const score = scoreWatchForDay(reverso, "formal", []);
    expect(score).toBeGreaterThan(0.6);
  });

  it("scores Black Bay higher for casual than formal", () => {
    const casualScore = scoreWatchForDay(blackbay, "casual", []);
    const formalScore = scoreWatchForDay(blackbay, "formal", []);
    expect(casualScore).toBeGreaterThan(formalScore);
  });

  it("applies recency penalty for recently worn watches", () => {
    const history = [{ watchId: snowflake.id }];
    const penalised  = scoreWatchForDay(snowflake, "hospital-smart-casual", history);
    const fresh      = scoreWatchForDay(laureato,  "hospital-smart-casual", []);
    // Both good watches; penalised one should score less
    const penalisedNoHistory = scoreWatchForDay(snowflake, "hospital-smart-casual", []);
    expect(penalisedNoHistory).toBeGreaterThan(penalised);
  });
});
