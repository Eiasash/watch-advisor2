import { describe, it, expect, vi, afterEach } from "vitest";
import { currentSeason } from "../src/outfitEngine/scoringFactors/seasonContextFactor.js";

/**
 * Tests for currentSeason() Jerusalem timezone correctness.
 * We mock toLocaleDateString to simulate specific month values
 * without relying on the actual system date.
 */

describe("currentSeason — Jerusalem timezone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockMonth(month1indexed) {
    // Patch Date.prototype.toLocaleDateString to return our controlled month
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (locale, opts) {
      if (opts?.month === "numeric" && opts?.timeZone === "Asia/Jerusalem") {
        return String(month1indexed);
      }
      return Intl.DateTimeFormat(locale, opts).format(this);
    });
  }

  it("January (1) → winter", () => { mockMonth(1);  expect(currentSeason()).toBe("winter"); });
  it("February (2) → winter", () => { mockMonth(2);  expect(currentSeason()).toBe("winter"); });
  it("March (3) → spring",   () => { mockMonth(3);  expect(currentSeason()).toBe("spring"); });
  it("April (4) → spring",   () => { mockMonth(4);  expect(currentSeason()).toBe("spring"); });
  it("May (5) → spring",     () => { mockMonth(5);  expect(currentSeason()).toBe("spring"); });
  it("June (6) → summer",    () => { mockMonth(6);  expect(currentSeason()).toBe("summer"); });
  it("July (7) → summer",    () => { mockMonth(7);  expect(currentSeason()).toBe("summer"); });
  it("August (8) → summer",  () => { mockMonth(8);  expect(currentSeason()).toBe("summer"); });
  it("September (9) → autumn",  () => { mockMonth(9);  expect(currentSeason()).toBe("autumn"); });
  it("October (10) → autumn",   () => { mockMonth(10); expect(currentSeason()).toBe("autumn"); });
  it("November (11) → autumn",  () => { mockMonth(11); expect(currentSeason()).toBe("autumn"); });
  it("December (12) → winter",  () => { mockMonth(12); expect(currentSeason()).toBe("winter"); });

  it("uses Asia/Jerusalem timezone option", () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("3");
    currentSeason();
    expect(spy).toHaveBeenCalledWith("en-US", expect.objectContaining({ timeZone: "Asia/Jerusalem" }));
  });
});
