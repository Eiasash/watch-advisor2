import { describe, it, expect, beforeEach } from "vitest";
import { setTailorConfig, getTailorPickupDate, getAllTailorConfig } from "../src/config/tailorConfig.js";

describe("tailorConfig", () => {
  beforeEach(() => {
    setTailorConfig({});
  });

  it("returns null when no config loaded", () => {
    expect(getTailorPickupDate()).toBeNull();
  });

  it("returns pickupDate when set", () => {
    setTailorConfig({ pickupDate: "2026-05-01" });
    expect(getTailorPickupDate()).toBe("2026-05-01");
  });

  it("returns null when pickupDate missing from config", () => {
    setTailorConfig({ somethingElse: true });
    expect(getTailorPickupDate()).toBeNull();
  });

  it("handles null input gracefully", () => {
    setTailorConfig({ pickupDate: "2026-04-09" });
    setTailorConfig(null);
    expect(getTailorPickupDate()).toBeNull();
  });

  it("handles undefined input gracefully", () => {
    setTailorConfig({ pickupDate: "2026-04-09" });
    setTailorConfig(undefined);
    expect(getTailorPickupDate()).toBeNull();
  });

  it("rejects non-string pickupDate values", () => {
    setTailorConfig({ pickupDate: 12345 });
    expect(getTailorPickupDate()).toBeNull();
    setTailorConfig({ pickupDate: true });
    expect(getTailorPickupDate()).toBeNull();
  });

  it("getAllTailorConfig returns a copy, not reference", () => {
    setTailorConfig({ pickupDate: "2026-04-09" });
    const a = getAllTailorConfig();
    const b = getAllTailorConfig();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.pickupDate = "hacked";
    expect(getTailorPickupDate()).toBe("2026-04-09");
  });

  it("getAllTailorConfig includes all config keys", () => {
    setTailorConfig({ pickupDate: "2026-04-09", garmentIds: ["g1", "g2"] });
    const all = getAllTailorConfig();
    expect(all.pickupDate).toBe("2026-04-09");
    expect(all.garmentIds).toEqual(["g1", "g2"]);
  });
});
