import { describe, it, expect } from "vitest";
import { pickWatchForCalendar } from "../src/engine/calendarWatchRotation.js";
import { inferDayProfile, scoreWatchForDay, DAY_PROFILES } from "../src/engine/dayProfile.js";

const watches = [
  { id: "reverso", formality: 9, style: "dress", replica: false },
  { id: "speedmaster", formality: 5, style: "sport", replica: false },
  { id: "submariner", formality: 6, style: "diver", replica: true },
  { id: "datejust", formality: 7, style: "sport-elegant", replica: false },
  { id: "royal-oak", formality: 7, style: "sport-elegant", replica: true },
];

// ── Edge cases for pickWatchForCalendar ─────────────────────────────────────

describe("pickWatchForCalendar — edge cases", () => {
  it("two identical watches: primary and backup both returned", () => {
    const twins = [
      { id: "a", formality: 6, style: "sport", replica: false },
      { id: "b", formality: 6, style: "sport", replica: false },
    ];
    const result = pickWatchForCalendar(twins);
    expect(result.primary).not.toBeNull();
    expect(result.backup).not.toBeNull();
    expect(result.primary.id).not.toBe(result.backup.id);
  });

  it("watches with undefined formality default gracefully", () => {
    const noFormality = [
      { id: "x", style: "sport", replica: false },
      { id: "y", style: "dress", replica: false },
    ];
    const result = pickWatchForCalendar(noFormality);
    expect(result.primary).not.toBeNull();
  });

  it("watches with undefined style still score", () => {
    const noStyle = [
      { id: "a", formality: 7, replica: false },
    ];
    const result = pickWatchForCalendar(noStyle);
    expect(result.primary.id).toBe("a");
    expect(result.backup).toBeNull();
  });

  it("all watches recently worn: still picks best match", () => {
    const history = watches.map(w => ({ watchId: w.id }));
    const result = pickWatchForCalendar(watches, [], {}, history);
    expect(result.primary).not.toBeNull();
  });

  it("history longer than 7: only last 7 penalized", () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      watchId: watches[i % watches.length].id,
    }));
    const result = pickWatchForCalendar(watches, [], {}, longHistory);
    expect(result.primary).not.toBeNull();
  });

  it("weather parameter ignored in current implementation", () => {
    const cold = pickWatchForCalendar(watches, [], { tempC: -10 });
    const hot  = pickWatchForCalendar(watches, [], { tempC: 40 });
    // Weather doesn't affect watch selection currently
    expect(cold.dayProfile).toBe(hot.dayProfile);
  });

  it("multiple events: EVENT_KEYWORDS iteration order determines priority", () => {
    const result = pickWatchForCalendar(watches, ["Gym workout", "Black tie gala"]);
    // Events are concatenated then keywords checked in order: hospital → formal → casual → travel → shift
    // "black tie" matches formal, which is checked before casual ("gym")
    expect(result.dayProfile).toBe("formal");
  });

  it("events with mixed case handled correctly", () => {
    const result = pickWatchForCalendar(watches, ["HOSPITAL WARD ROUNDS"]);
    expect(result.dayProfile).toBe("hospital-smart-casual");
  });
});

// ── Edge cases for inferDayProfile ──────────────────────────────────────────

describe("inferDayProfile — edge cases", () => {
  it("returns smart-casual for undefined events", () => {
    expect(inferDayProfile(undefined)).toBe("smart-casual");
  });

  it("returns smart-casual for null-like events", () => {
    expect(inferDayProfile([])).toBe("smart-casual");
  });

  it("detects shift profile from 'on-call'", () => {
    expect(inferDayProfile(["on-call tonight"])).toBe("shift");
  });

  it("detects shift profile from 'night shift'", () => {
    expect(inferDayProfile(["night shift"])).toBe("shift");
  });

  it("detects travel from 'flight'", () => {
    expect(inferDayProfile(["flight to London"])).toBe("travel");
  });

  it("detects travel from 'airport'", () => {
    expect(inferDayProfile(["airport pickup"])).toBe("travel");
  });

  it("detects casual from 'gym'", () => {
    expect(inferDayProfile(["gym session"])).toBe("casual");
  });

  it("detects casual from 'beach'", () => {
    expect(inferDayProfile(["beach day"])).toBe("casual");
  });

  it("hospital keywords take priority (tested first)", () => {
    // hospital-smart-casual keywords are checked first in EVENT_KEYWORDS
    expect(inferDayProfile(["hospital clinic"])).toBe("hospital-smart-casual");
  });

  it("partial keyword match within event text", () => {
    expect(inferDayProfile(["Attending a wedding reception"])).toBe("formal");
  });

  it("multiple events concatenated for matching", () => {
    expect(inferDayProfile(["Morning meeting", "Evening formal dinner"])).toBe("formal");
  });

  it("no keyword match returns smart-casual", () => {
    expect(inferDayProfile(["Regular day at the office"])).toBe("smart-casual");
  });
});

// ── Edge cases for scoreWatchForDay ─────────────────────────────────────────

describe("scoreWatchForDay — edge cases", () => {
  it("perfect formality match gives max formality score component", () => {
    const watch = { id: "w1", formality: 9, style: "dress", replica: false };
    const score = scoreWatchForDay(watch, "formal", []);
    // formality diff = 0, style match = "dress" in formal list, no recency, no replica penalty
    // v2: never-worn watch gets recencyScore=0.75, cooldown=1.15
    // (0.4*1 + 0.35*1 + 0.25*0.75) * 1.15 + jitter ≈ 1.08
    expect(score).toBeGreaterThan(1.0);
    expect(score).toBeLessThan(1.15);
  });

  it("formality diff of 4+ gives zero formality component", () => {
    const watch = { id: "w1", formality: 1, style: "sport", replica: false };
    // formal target = 9, diff = 8, formalityScore = max(0, 1 - 8/4) = 0
    const score = scoreWatchForDay(watch, "formal", []);
    // 0.4 * 0 + 0.35 * 0.3 (dress not in list) + 0.25 * 1 = 0.355 + jitter
    expect(score).toBeCloseTo(0.355, 1);
  });

  it("replica penalty applied in hospital context", () => {
    // Use same ID so jitter cancels out in the diff
    const genuine = { id: "same", formality: 7, style: "sport-elegant", replica: false };
    const replica = { id: "same", formality: 7, style: "sport-elegant", replica: true };
    const gScore = scoreWatchForDay(genuine, "hospital-smart-casual", []);
    const rScore = scoreWatchForDay(replica, "hospital-smart-casual", []);
    // v2: penalty is (0.5 * cooldown) since penalty is pre-cooldown; expect ~0.575
    expect(gScore - rScore).toBeCloseTo(0.575, 1);
  });

  it("replica penalty applied in formal context", () => {
    const genuine = { id: "same", formality: 9, style: "dress", replica: false };
    const replica = { id: "same", formality: 9, style: "dress", replica: true };
    const gScore = scoreWatchForDay(genuine, "formal", []);
    const rScore = scoreWatchForDay(replica, "formal", []);
    // v2: penalty is (0.5 * cooldown) since penalty is pre-cooldown; expect ~0.575
    expect(gScore - rScore).toBeCloseTo(0.575, 1);
  });

  it("replica penalty applied in shift context", () => {
    const genuine = { id: "same", formality: 7, style: "sport-elegant", replica: false, shiftWatch: true };
    const replica = { id: "same", formality: 7, style: "sport-elegant", replica: true, shiftWatch: true };
    const gScore = scoreWatchForDay(genuine, "shift", []);
    const rScore = scoreWatchForDay(replica, "shift", []);
    // v2: penalty is (0.5 * cooldown) since penalty is pre-cooldown; expect ~0.575
    expect(gScore - rScore).toBeCloseTo(0.575, 1);
  });

  it("shift context hard-gates watches without shiftWatch flag", () => {
    const withFlag    = { id: "w1", formality: 7, style: "sport", shiftWatch: true };
    const withoutFlag = { id: "w2", formality: 7, style: "sport" };
    expect(scoreWatchForDay(withFlag, "shift", [])).toBeGreaterThan(0);
    expect(scoreWatchForDay(withoutFlag, "shift", [])).toBe(0);
  });

  it("NO replica penalty in casual context", () => {
    const genuine = { id: "same", formality: 5, style: "sport", replica: false };
    const replica = { id: "same", formality: 5, style: "sport", replica: true };
    const gScore = scoreWatchForDay(genuine, "casual", []);
    const rScore = scoreWatchForDay(replica, "casual", []);
    expect(gScore - rScore).toBeCloseTo(0, 5);
  });

  it("NO replica penalty in smart-casual context", () => {
    const genuine = { id: "same", formality: 6, style: "sport", replica: false };
    const replica = { id: "same", formality: 6, style: "sport", replica: true };
    expect(scoreWatchForDay(genuine, "smart-casual", []) - scoreWatchForDay(replica, "smart-casual", [])).toBeCloseTo(0, 5);
  });

  it("recency penalty: recently worn watch scores lower", () => {
    const watch = { id: "w1", formality: 6, style: "sport", replica: false };
    // Use non-empty histories for both to avoid empty-history jitter boost
    const notWorn = scoreWatchForDay(watch, "smart-casual", [{ watchId: "other" }]);
    const worn = scoreWatchForDay(watch, "smart-casual", [{ watchId: "w1" }]);
    expect(worn).toBeLessThan(notWorn);
    // recency diff = 0.25 * 0.75 * cooldown ≈ 0.216
    expect(notWorn - worn).toBeCloseTo(0.216, 1);
  });

  it("undefined formality treated as 5", () => {
    const watch = { id: "w1", style: "sport", replica: false };
    // smart-casual target = 6, diff = 1 → formalityScore = 0.75
    // sport in smart-casual suitability → styleScore = 1.0
    // never-worn → recencyScore = 0.75, cooldown = 1.15
    // (0.4*0.75 + 0.35*1 + 0.25*0.75) * 1.15 ≈ 0.963 + jitter + empty-history boost
    const score = scoreWatchForDay(watch, "smart-casual", []);
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThan(1.10);
  });

  it("unknown day profile uses default formality 6", () => {
    const watch = { id: "w1", formality: 6, style: "sport", replica: false };
    const score = scoreWatchForDay(watch, "nonexistent-profile", []);
    // diff = 0, no suitable styles → 0.3, recencyScore = 0.75, cooldown = 1.15
    // (0.4*1 + 0.35*0.3 + 0.25*0.75) * 1.15 ≈ 0.796 + jitter + empty-history boost
    expect(score).toBeGreaterThan(0.75);
    expect(score).toBeLessThan(0.95);
  });

  it("history beyond 7 entries: only last 7 checked", () => {
    const watch = { id: "w1", formality: 6, style: "sport", replica: false };
    // w1 worn 8 entries ago — outside last-7 window
    const history = [
      { watchId: "w1" },
      ...Array.from({ length: 7 }, () => ({ watchId: "other" })),
    ];
    const score = scoreWatchForDay(watch, "smart-casual", history);
    // w1 is NOT in last 7, so same as if w1 was never worn
    const noTarget = Array.from({ length: 7 }, () => ({ watchId: "other" }));
    const notWorn = scoreWatchForDay(watch, "smart-casual", noTarget);
    expect(score).toBe(notWorn);
  });
});

// ── DAY_PROFILES constant ───────────────────────────────────────────────────

describe("DAY_PROFILES constant", () => {
  it("contains expected profiles", () => {
    expect(DAY_PROFILES).toContain("hospital-smart-casual");
    expect(DAY_PROFILES).toContain("smart-casual");
    expect(DAY_PROFILES).toContain("formal");
    expect(DAY_PROFILES).toContain("casual");
    expect(DAY_PROFILES).toContain("travel");
    expect(DAY_PROFILES).toContain("shift");
  });

  it("has exactly 6 profiles", () => {
    expect(DAY_PROFILES).toHaveLength(6);
  });
});
