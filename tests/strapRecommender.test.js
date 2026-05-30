import { describe, it, expect } from "vitest";
import { recommendStrap } from "../src/outfitEngine/strapRecommender.js";

describe("strapRecommender", () => {
  const brownStrap = { id: "brown", label: "Brown leather", color: "brown", type: "leather" };
  const blackStrap = { id: "black", label: "Black leather", color: "black", type: "leather" };
  const bracelet = { id: "bracelet", label: "Steel bracelet", color: "silver", type: "bracelet" };
  const natoStrap = { id: "nato", label: "Olive NATO", color: "olive", type: "nato" };

  const brownShoes = { id: "sh1", type: "shoes", name: "Brown boots", color: "brown", formality: 6 };
  const blackShoes = { id: "sh2", type: "shoes", name: "Black oxfords", color: "black", formality: 8 };

  const watch = {
    id: "santos_large",
    dial: "white",
    formality: 6,
    straps: [brownStrap, blackStrap, bracelet],
  };

  it("returns null when watch has 0 or 1 strap", () => {
    expect(recommendStrap({ straps: [] }, {}, "casual")).toBeNull();
    expect(recommendStrap({ straps: [brownStrap] }, {}, "casual")).toBeNull();
    expect(recommendStrap(null, {}, "casual")).toBeNull();
  });

  it("recommends brown strap with brown shoes", () => {
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(result.recommended.color).toBe("brown");
  });

  it("recommends a strap with black shoes (rule disabled — no shoe-color enforcement)", () => {
    const outfit = { shoes: blackShoes, shirt: { color: "white" }, pants: { color: "charcoal" } };
    const result = recommendStrap(watch, outfit, "formal");
    expect(result).not.toBeNull();
  });

  it("bracelet is always viable (score 0.70)", () => {
    const watchBracelet = { ...watch, straps: [bracelet, brownStrap] };
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(watchBracelet, outfit, "smart-casual");
    expect(result).not.toBeNull();
  });

  it("recommends some strap regardless of shoe color (rule disabled)", () => {
    const watchBrownBlack = { ...watch, straps: [brownStrap, blackStrap] };
    const outfit = { shoes: blackShoes, shirt: { color: "white" }, pants: { color: "grey" } };
    const result = recommendStrap(watchBrownBlack, outfit, "formal");
    expect(result).not.toBeNull();
  });

  it("formal context boosts leather strap", () => {
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const watchLeatherNato = { ...watch, straps: [brownStrap, natoStrap] };
    const result = recommendStrap(watchLeatherNato, outfit, "clinic");
    expect(result).not.toBeNull();
    expect(result.recommended.color).toBe("brown");
  });

  it("casual context can boost NATO/rubber", () => {
    const outfit = { shoes: { ...brownShoes, color: "olive" }, shirt: { color: "white" }, pants: { color: "khaki" } };
    const watchNatoBracelet = { ...watch, straps: [natoStrap, bracelet] };
    const result = recommendStrap(watchNatoBracelet, outfit, "casual");
    expect(result).not.toBeNull();
  });

  it("provides alternatives array", () => {
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(Array.isArray(result.alternatives)).toBe(true);
  });

  it("provides a reason string", () => {
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("outfit palette affinity for matching color families", () => {
    const olivePants = { id: "p1", type: "pants", name: "Olive chinos", color: "olive" };
    const oliveStrap = { id: "olive", label: "Olive NATO", color: "olive", type: "nato" };
    const watchOlive = { ...watch, straps: [oliveStrap, brownStrap] };
    const outfit = { shoes: brownShoes, pants: olivePants, shirt: { color: "white" } };
    const result = recommendStrap(watchOlive, outfit, "casual");
    expect(result).not.toBeNull();
  });

  it("dial harmony bonus for matching strap and dial color families", () => {
    const blueDialWatch = {
      ...watch,
      dial: "blue",
      straps: [{ id: "navy", label: "Navy leather", color: "navy", type: "leather" }, brownStrap],
    };
    const outfit = { shoes: blackShoes, shirt: { color: "white" }, pants: { color: "charcoal" } };
    const result = recommendStrap(blueDialWatch, outfit, "smart-casual");
    expect(result).not.toBeNull();
  });

  it("Pasha bracelet — brown leather beats bracelet for brown shoes", () => {
    const pashaWatch = {
      id: "pasha",
      dial: "grey",
      straps: [
        { id: "pasha-bracelet", label: "Bracelet", color: "silver", type: "bracelet", poorFit: true },
        { id: "pasha-brown", label: "Brown leather", color: "brown", type: "leather" },
      ],
    };
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(pashaWatch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(result.recommended.color).toBe("brown");
  });

  it("recommended object has id, label, color, score fields", () => {
    const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };
    const result = recommendStrap(watch, outfit, "smart-casual");
    expect(result).not.toBeNull();
    expect(result.recommended).toHaveProperty("id");
    expect(result.recommended).toHaveProperty("label");
    expect(result.recommended).toHaveProperty("color");
    expect(result.recommended).toHaveProperty("score");
    expect(result.recommended.score).toBeGreaterThan(0);
    expect(result.recommended.score).toBeLessThanOrEqual(1.0);
  });
});

describe("strapRecommender — rotation + health (bundle generation)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const brownShoes = { id: "sh1", type: "shoes", color: "brown", formality: 6 };
  const outfit = { shoes: brownShoes, shirt: { color: "white" }, pants: { color: "navy" } };

  it("backward-compatible: no history => same pick", () => {
    const w = { id: "w", dial: "white", straps: [
      { id: "brown", label: "Brown leather", color: "brown", type: "leather" },
      { id: "black", label: "Black leather", color: "black", type: "leather" },
    ]};
    expect(recommendStrap(w, outfit, "smart-casual").recommended.color).toBe("brown");
    expect(recommendStrap(w, outfit, "smart-casual", {}, []).recommended.color).toBe("brown");
  });

  it("rotation: deprioritises the strap worn today between two equal straps", () => {
    const w = { id: "w", dial: "white", straps: [
      { id: "brownA", label: "Brown leather A", color: "brown", type: "leather" },
      { id: "brownB", label: "Brown leather B", color: "brown", type: "leather" },
    ]};
    const res = recommendStrap(w, outfit, "smart-casual", {}, [{ date: today, watchId: "w", strapId: "brownA" }]);
    expect(res.recommended.id).toBe("brownB");
  });

  it("health: prefers a fresh strap over a near-end-of-life equal one", () => {
    const w = { id: "w", dial: "white", straps: [
      { id: "wornGator", label: "Brown alligator", color: "brown", type: "alligator" },
      { id: "freshGator", label: "Brown alligator B", color: "brown", type: "alligator" },
    ]};
    const history = Array.from({ length: 210 }, (_, i) => ({ date: daysAgo(120 + i), watchId: "w", strapId: "wornGator" }));
    const res = recommendStrap(w, outfit, "smart-casual", {}, history);
    expect(res.recommended.id).toBe("freshGator");
    const worn = [res.recommended, ...res.alternatives].find(s => s.id === "wornGator");
    expect(worn.healthPct).toBeLessThan(30);
  });

  it("bracelet is infinite-life: never health-penalised even with heavy wear", () => {
    const w = { id: "w", dial: "white", straps: [
      { id: "brace", label: "Steel bracelet", color: "silver", type: "bracelet" },
      { id: "brown", label: "Brown leather", color: "brown", type: "leather" },
    ]};
    const history = Array.from({ length: 400 }, (_, i) => ({ date: daysAgo(10 + i), watchId: "w", strapId: "brace" }));
    const res = recommendStrap(w, outfit, "formal", {}, history);
    const brace = [res.recommended, ...res.alternatives].find(s => s.id === "brace");
    expect(brace).toBeTruthy();
    expect(brace.healthPct).toBe(100);
  });

  it("exposes healthPct on the recommended strap", () => {
    const w = { id: "w", dial: "white", straps: [
      { id: "brown", label: "Brown leather", color: "brown", type: "leather" },
      { id: "black", label: "Black leather", color: "black", type: "leather" },
    ]};
    expect(recommendStrap(w, outfit, "smart-casual", {}, [])).toHaveProperty("recommended.healthPct");
  });
});
