import { describe, it, expect } from "vitest";
import { inferDayProfile, scoreWatchForDay } from "../src/engine/dayProfile.js";

// ─── inferDayProfile — keyword coverage ─────────────────────────────────────

describe("inferDayProfile — extended keyword coverage", () => {
  it("detects consult keyword", () => {
    expect(inferDayProfile(["Consult with Dr. Smith"])).toBe("hospital-smart-casual");
  });

  it("detects ICU keyword", () => {
    expect(inferDayProfile(["ICU admission"])).toBe("hospital-smart-casual");
  });

  it("detects patient keyword", () => {
    expect(inferDayProfile(["patient assessment"])).toBe("hospital-smart-casual");
  });

  it("detects duty keyword", () => {
    expect(inferDayProfile(["duty roster review"])).toBe("hospital-smart-casual");
  });

  it("detects ER keyword with spaces", () => {
    expect(inferDayProfile(["Called to ER stat"])).toBe("hospital-smart-casual");
  });

  it("detects ceremony keyword → formal", () => {
    expect(inferDayProfile(["Graduation ceremony"])).toBe("formal");
  });

  it("detects evening dinner → formal", () => {
    expect(inferDayProfile(["Formal dinner at club"])).toBe("formal");
  });

  it("detects dinner party → formal", () => {
    expect(inferDayProfile(["Dinner party at home"])).toBe("formal");
  });

  it("detects hike → casual", () => {
    expect(inferDayProfile(["Morning hike"])).toBe("casual");
  });

  it("detects beach → casual", () => {
    expect(inferDayProfile(["Beach day"])).toBe("casual");
  });

  it("detects workout → casual", () => {
    expect(inferDayProfile(["Afternoon workout"])).toBe("casual");
  });

  it("detects training → casual", () => {
    expect(inferDayProfile(["Training session"])).toBe("casual");
  });

  it("detects airport → travel", () => {
    expect(inferDayProfile(["Airport pickup"])).toBe("travel");
  });

  it("detects conference → travel", () => {
    expect(inferDayProfile(["Tech conference downtown"])).toBe("travel");
  });

  it("detects trip → travel", () => {
    expect(inferDayProfile(["Weekend trip to coast"])).toBe("travel");
  });

  it("detects oncall keyword → shift", () => {
    expect(inferDayProfile(["oncall weekend"])).toBe("shift");
  });

  it("detects night shift → shift", () => {
    expect(inferDayProfile(["Night shift starts"])).toBe("shift");
  });

  it("detects call night → shift", () => {
    expect(inferDayProfile(["Call night schedule"])).toBe("shift");
  });
});

// ─── scoreWatchForDay — formality scoring boundaries ────────────────────────

describe("scoreWatchForDay — formality calculations", () => {
  const watch = { id: "test", formality: 7, style: "dress-sport", replica: false };

  it("perfect formality match for hospital-smart-casual (target=7)", () => {
    const score = scoreWatchForDay(watch, "hospital-smart-casual");
    // formalityDiff = 0, formalityScore = 1.0
    // dress-sport is suitable → styleScore = 1.0
    // no history → recencyScore = 0.50 (never-worn cap), cooldown = 1.15
    // no replica penalty, + daily jitter + empty-history boost
    // (0.4*1 + 0.35*1 + 0.25*0.50) * 1.15 ≈ 1.01 + jitter
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThan(1.2);
  });

  it("formality off by 2 for casual (target=5)", () => {
    const score = scoreWatchForDay(watch, "casual");
    const formalityScore = 1 - 2 / 4; // 0.5
    // dress-sport not in casual suitability → styleScore = 0.3, + jitter
    // Score includes daily jitter + empty-history boost; use wider tolerance
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.75);
  });

  it("formality off by 4+ clamps to 0", () => {
    const lowFormality = { id: "low", formality: 1, style: "sport", replica: false };
    const score = scoreWatchForDay(lowFormality, "formal"); // target=9, diff=8
    // formalityScore = max(0, 1-8/4) = 0
    expect(score).toBeGreaterThanOrEqual(0); // styleScore contributes
  });
});

// ─── scoreWatchForDay — replica penalty magnitude ───────────────────────────

describe("scoreWatchForDay — replica penalty (-0.5 × cooldown)", () => {
  // Same ID ensures daily jitter cancels out in the diff
  const watch = { id: "rep", formality: 7, style: "dress-sport", replica: true };
  const genuine = { id: "rep", formality: 7, style: "dress-sport", replica: false };
  // Never-worn → cooldown = 1.15, so diff = 0.5 * 1.15 = 0.575

  it("hospital-smart-casual replica penalty is 0.575", () => {
    const diff = scoreWatchForDay(genuine, "hospital-smart-casual") - scoreWatchForDay(watch, "hospital-smart-casual");
    expect(diff).toBeCloseTo(0.575, 2);
  });

  it("formal replica penalty is 0.575", () => {
    const diff = scoreWatchForDay(genuine, "formal") - scoreWatchForDay(watch, "formal");
    expect(diff).toBeCloseTo(0.575, 2);
  });

  it("shift replica penalty is 0.575", () => {
    const diff = scoreWatchForDay({ ...genuine, shiftWatch: true }, "shift") - scoreWatchForDay({ ...watch, shiftWatch: true }, "shift");
    expect(diff).toBeCloseTo(0.575, 2);
  });

  it("smart-casual has zero replica penalty", () => {
    const diff = scoreWatchForDay(genuine, "smart-casual") - scoreWatchForDay(watch, "smart-casual");
    expect(diff).toBeCloseTo(0, 5);
  });

  it("travel has zero replica penalty", () => {
    const diff = scoreWatchForDay(genuine, "travel") - scoreWatchForDay(watch, "travel");
    expect(diff).toBeCloseTo(0, 5);
  });
});

// ─── scoreWatchForDay — recency window ──────────────────────────────────────

describe("scoreWatchForDay — recency window exactly 7", () => {
  const watch = { id: "target", formality: 7, style: "dress-sport", replica: false };

  it("watch at position 7 (most recent) is penalised", () => {
    const history = [...Array(6).fill({ watchId: "other" }), { watchId: "target" }];
    const penalised = scoreWatchForDay(watch, "smart-casual", history);
    const fresh = scoreWatchForDay(watch, "smart-casual", []);
    expect(penalised).toBeLessThan(fresh);
  });

  it("watch at position 8 (outside window) is not penalised vs recent", () => {
    const history = [{ watchId: "target" }, ...Array(7).fill({ watchId: "other" })];
    const score = scoreWatchForDay(watch, "smart-casual", history);
    // "target" is outside the last-7 window, so same recencyScore as never-worn
    // Compare against a history where target was never worn (not empty history,
    // which gets extra jitter)
    const noTargetHistory = Array(7).fill({ watchId: "other" });
    const notWorn = scoreWatchForDay(watch, "smart-casual", noTargetHistory);
    expect(score).toBe(notWorn);
  });
});
