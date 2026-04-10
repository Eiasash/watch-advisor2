import { describe, it, expect } from "vitest";
import { simulateTrade } from "../src/domain/tradeSimulator.js";

const collection = [
  { id: "speedmaster", brand: "Omega", model: "Speedmaster", dial: "black", style: "sport", replica: false, straps: [{ id: "s1" }, { id: "s2" }] },
  { id: "reverso", brand: "JLC", model: "Reverso", dial: "silver", style: "dress", replica: false, straps: [{ id: "s3" }] },
  { id: "gmt", brand: "Rolex", model: "GMT Master", dial: "blue", style: "sport", replica: true, straps: [{ id: "s4" }] },
  { id: "nautilus", brand: "PP", model: "Nautilus", dial: "blue", style: "sport-elegant", replica: true, straps: [] },
  { id: "retired", brand: "Old", model: "Retired Watch", dial: "grey", retired: true },
];

const history = [
  { watchId: "speedmaster", date: "2026-03-01" },
  { watchId: "speedmaster", date: "2026-03-05" },
  { watchId: "speedmaster", date: "2026-03-10" },
  { watchId: "gmt", date: "2026-03-02" },
  { watchId: "gmt", date: "2026-03-07" },
  { watchId: "reverso", date: "2026-03-03" },
];

describe("simulateTrade — basic trades", () => {
  it("trading out one watch reduces collection count", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"],
      tradeIn: null,
    });
    expect(result.after.count).toBe(result.before.count - 1);
    expect(result.impact.sizeChange).toBe(-1);
  });

  it("trading in one watch increases collection count", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: [],
      tradeIn: { id: "new", brand: "GP", model: "Laureato", dial: "grey", replica: false },
    });
    expect(result.after.count).toBe(result.before.count + 1);
  });

  it("1:1 trade keeps same count", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"],
      tradeIn: { id: "new", brand: "GP", model: "Laureato", dial: "green", replica: false },
    });
    expect(result.after.count).toBe(result.before.count);
    expect(result.impact.sizeChange).toBe(0);
  });

  it("tracks wears lost from traded-out watches", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["speedmaster"],
    });
    expect(result.impact.wearsLost.speedmaster).toBe(3);
    expect(result.impact.totalWearsLost).toBe(3);
  });

  it("reports zero wears lost for unworn traded watch", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["nautilus"],
    });
    expect(result.impact.wearsLost.nautilus).toBe(0);
    expect(result.impact.totalWearsLost).toBe(0);
  });
});

describe("simulateTrade — dial diversity", () => {
  it("detects lost dial families when trading out unique color", () => {
    // Only speedmaster has black dial
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["speedmaster"],
    });
    expect(result.impact.dialFamiliesLost).toContain("black");
  });

  it("does NOT report lost family when another watch shares it", () => {
    // Both gmt and nautilus have blue dials
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"],
    });
    expect(result.impact.dialFamiliesLost).not.toContain("blue");
  });

  it("detects gained dial families", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: [],
      tradeIn: { id: "new", dial: "green" },
    });
    expect(result.impact.dialFamiliesGained).toContain("green");
  });
});

describe("simulateTrade — genuine/replica tracking", () => {
  it("tracks genuine/replica counts before and after", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"], // replica
      tradeIn: { id: "new", replica: false },
    });
    expect(result.after.genuine).toBe(result.before.genuine + 1);
    expect(result.after.replica).toBe(result.before.replica - 1);
  });
});

describe("simulateTrade — strap tracking", () => {
  it("tracks strap count change", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["speedmaster"], // 2 straps
      tradeIn: { id: "new", straps: [{ id: "s-new" }] }, // 1 strap
    });
    expect(result.impact.strapChange).toBe(-1); // lost 2, gained 1
  });
});

describe("simulateTrade — cash delta", () => {
  it("includes cash delta in result", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"],
      tradeIn: { id: "new", dial: "grey" },
      cashDelta: -15000,
    });
    expect(result.impact.cashDelta).toBe(-15000);
  });
});

describe("simulateTrade — verdict", () => {
  it("generates verdict array", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt"],
    });
    expect(Array.isArray(result.verdict)).toBe(true);
    expect(result.verdict.length).toBeGreaterThan(0);
  });

  it("positive verdict for trading unworn pieces", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["nautilus"], // 0 wears
    });
    expect(result.verdict.some(v => v.includes("unworn"))).toBe(true);
  });

  it("warning for trading heavily worn pieces", () => {
    const result = simulateTrade({
      collection,
      history: [
        ...history,
        ...Array.from({ length: 10 }, (_, i) => ({ watchId: "speedmaster", date: `2026-04-${i + 1}` })),
      ],
      tradeOut: ["speedmaster"], // many wears
    });
    expect(result.verdict.some(v => v.includes("logged wears"))).toBe(true);
  });

  it("ignores retired watches in calculations", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: [],
    });
    // retired watch should not appear in before.count
    expect(result.before.count).toBe(4); // 5 total - 1 retired
  });
});

describe("simulateTrade — multiple trades", () => {
  it("handles trading out multiple watches", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: ["gmt", "nautilus"],
    });
    expect(result.after.count).toBe(result.before.count - 2);
  });

  it("handles trading in multiple watches", () => {
    const result = simulateTrade({
      collection,
      history,
      tradeOut: [],
      tradeIn: [
        { id: "new1", dial: "green" },
        { id: "new2", dial: "red" },
      ],
    });
    expect(result.after.count).toBe(result.before.count + 2);
  });
});
