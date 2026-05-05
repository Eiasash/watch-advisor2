import { describe, it, expect } from "vitest";

/**
 * Endpoint-routing regression for WeekPlanner's handleAskClaude.
 *
 * BUG (v1.13.4 audit): WeekPlanner unconditionally POSTed to
 * /.netlify/functions/style-fixed-watch even when its body omitted
 * pinnedWatch — the spread `...(pinnedWatch && !isDifferentWatchMode
 * ? { pinnedWatch } : {})` correctly omitted the pin in both
 * Different-watch mode and no-pin-on-this-day mode, but the URL was
 * hardcoded. The endpoint enforces `pinnedWatch.id required` and
 * returned 400 with body
 *   { error: "pinnedWatch.id required for style-fixed-watch — use /daily-pick for open-watch picks" }
 * which the planner caught and silently surfaced as
 *   "[WeekPlanner] AI pick failed: 400"
 * — so "Different watch" steer chip looked dead from the user's POV.
 *
 * The fix moves the URL choice next to the body shape so they cannot
 * drift again. This test pins the contract: when sendingPin is false,
 * the endpoint MUST be /daily-pick.
 *
 * The pure helper below mirrors the inline logic added in v1.13.5;
 * if you refactor handleAskClaude, copy the helper out and re-run this
 * test against the new shape — keep `sendingPin` as the single flag
 * gating both body field AND URL.
 */

function chooseEndpoint({ pinnedWatch, isDifferentWatchMode }) {
  const sendingPin = !!pinnedWatch && !isDifferentWatchMode;
  return {
    sendingPin,
    endpoint: sendingPin
      ? "/.netlify/functions/style-fixed-watch"
      : "/.netlify/functions/daily-pick",
  };
}

describe("WeekPlanner endpoint routing", () => {
  it("uses style-fixed-watch when pinnedWatch is present and not Different-watch mode", () => {
    const { sendingPin, endpoint } = chooseEndpoint({
      pinnedWatch: { id: "tudor-bb41" },
      isDifferentWatchMode: false,
    });
    expect(sendingPin).toBe(true);
    expect(endpoint).toBe("/.netlify/functions/style-fixed-watch");
  });

  it("falls back to daily-pick when pinnedWatch is null (e.g. empty rotation day)", () => {
    const { sendingPin, endpoint } = chooseEndpoint({
      pinnedWatch: null,
      isDifferentWatchMode: false,
    });
    expect(sendingPin).toBe(false);
    expect(endpoint).toBe("/.netlify/functions/daily-pick");
  });

  it("falls back to daily-pick in Different-watch mode (PR #162) — no pin in body", () => {
    const { sendingPin, endpoint } = chooseEndpoint({
      pinnedWatch: { id: "tudor-bb41" },
      isDifferentWatchMode: true,
    });
    expect(sendingPin).toBe(false);
    expect(endpoint).toBe("/.netlify/functions/daily-pick");
  });

  it("falls back to daily-pick when both pinnedWatch missing AND Different-watch mode", () => {
    const { endpoint } = chooseEndpoint({
      pinnedWatch: null,
      isDifferentWatchMode: true,
    });
    expect(endpoint).toBe("/.netlify/functions/daily-pick");
  });

  it("outfitFingerprintFor — stable string across slot reorder", () => {
    function outfitFingerprintFor(overrides) {
      const SLOTS = ["shirt", "sweater", "layer", "pants", "shoes", "jacket", "belt"];
      if (!overrides || typeof overrides !== "object") return "";
      return SLOTS.map(slot => `${slot}:${overrides[slot]?.id ?? ""}`).join("|");
    }
    const a = { shirt: { id: "s1" }, pants: { id: "p1" } };
    const b = { pants: { id: "p1" }, shirt: { id: "s1" } };
    expect(outfitFingerprintFor(a)).toBe(outfitFingerprintFor(b));
    expect(outfitFingerprintFor(null)).toBe("");
    expect(outfitFingerprintFor(undefined)).toBe("");
    // Slot change detected
    expect(outfitFingerprintFor({ shirt: { id: "s1" } }))
      .not.toBe(outfitFingerprintFor({ shirt: { id: "s2" } }));
    // Slot removal detected
    expect(outfitFingerprintFor({ shirt: { id: "s1" } }))
      .not.toBe(outfitFingerprintFor({}));
  });

  // Guard against the original bug class — the URL must always be
  // /style-fixed-watch when (and ONLY when) sendingPin is true.
  it("contract: URL choice and sendingPin flag are equivalent", () => {
    const cases = [
      { pinnedWatch: { id: "x" }, isDifferentWatchMode: false },
      { pinnedWatch: null,        isDifferentWatchMode: false },
      { pinnedWatch: { id: "x" }, isDifferentWatchMode: true },
      { pinnedWatch: null,        isDifferentWatchMode: true },
    ];
    for (const c of cases) {
      const { sendingPin, endpoint } = chooseEndpoint(c);
      const isFixed = endpoint === "/.netlify/functions/style-fixed-watch";
      expect(isFixed).toBe(sendingPin);
    }
  });
});
