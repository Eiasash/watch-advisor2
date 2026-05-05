import { describe, it, expect } from "vitest";
import { pickContextualTemp } from "../src/weather/weatherService.js";

/**
 * pickContextualTemp picks the right hourly temp for the day's context —
 * "you dress for what you'll actually be doing." Added v1.13.7 to fix the
 * bug where the planner sent tempMorning to the engine even when the user's
 * context was "Date Night" (an evening occasion). Now date-night uses
 * tempEvening, midday-social uses tempMidday, default falls back to morning.
 */

const fc = (overrides = {}) => ({
  tempC: 18,
  tempMorning: 14,
  tempMidday: 22,
  tempEvening: 11,
  ...overrides,
});

describe("pickContextualTemp", () => {
  it("evening contexts use tempEvening", () => {
    expect(pickContextualTemp(fc(), "date-night")).toBe(11);
    expect(pickContextualTemp(fc(), "family-event")).toBe(11);
    expect(pickContextualTemp(fc(), "eid-celebration")).toBe(11);
  });

  it("casual / midday-social uses tempMidday", () => {
    expect(pickContextualTemp(fc(), "casual")).toBe(22);
  });

  it("morning / work / shift / smart-casual → tempMorning", () => {
    expect(pickContextualTemp(fc(), "smart-casual")).toBe(14);
    expect(pickContextualTemp(fc(), "shift")).toBe(14);
    expect(pickContextualTemp(fc(), null)).toBe(14);
    expect(pickContextualTemp(fc(), undefined)).toBe(14);
  });

  it("falls back through Morning → Midday → Evening → tempC", () => {
    expect(pickContextualTemp({ tempC: 18 }, null)).toBe(18);
    expect(pickContextualTemp({ tempC: 18, tempMidday: 21 }, null)).toBe(21);
    expect(pickContextualTemp({ tempC: 18, tempEvening: 9 }, null)).toBe(9);
    // Evening context, only morning available → evening picks fall back to morning
    expect(pickContextualTemp({ tempMorning: 14 }, "date-night")).toBe(14);
  });

  it("returns null for null/missing forecast", () => {
    expect(pickContextualTemp(null, "date-night")).toBe(null);
    expect(pickContextualTemp(undefined, null)).toBe(null);
  });

  it("works end-to-end with engine threshold — 22°C midday means 'no layer' for casual but 'sweater' for date-night when evening drops to 11°C", () => {
    const f = fc({ tempMidday: 23, tempEvening: 11 });
    // Casual context — midday warm — engine adds nothing (>=22)
    expect(pickContextualTemp(f, "casual")).toBe(23);
    // Date-night — evening cold — engine should add coat (<12)
    expect(pickContextualTemp(f, "date-night")).toBe(11);
  });
});
