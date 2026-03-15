import { describe, it, expect, vi } from "vitest";
import { buildTomorrowContext, forecastRecommendation } from "../src/domain/scenarioForecast.js";

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("buildTomorrowContext", () => {
  it("produces tomorrow's ISO date", () => {
    const ctx = buildTomorrowContext({ history: [], garments: [], watches: [], forecastTempC: null });
    expect(ctx.date).toBe(tomorrowDateStr());
  });

  it("passes through all input arrays unchanged", () => {
    const history = [{ id: "h1" }];
    const garments = [{ id: "g1" }];
    const watches  = [{ id: "w1" }];
    const ctx = buildTomorrowContext({ history, garments, watches, forecastTempC: 20 });
    expect(ctx.history).toBe(history);
    expect(ctx.garments).toBe(garments);
    expect(ctx.watches).toBe(watches);
  });

  it("sets tempC from forecastTempC", () => {
    const ctx = buildTomorrowContext({ history: [], garments: [], watches: [], forecastTempC: 14 });
    expect(ctx.tempC).toBe(14);
  });

  it("sets tempC to null when forecastTempC is not provided", () => {
    const ctx = buildTomorrowContext({ history: [], garments: [], watches: [] });
    expect(ctx.tempC).toBeNull();
  });

  it("date is always one day ahead of today", () => {
    const today    = new Date().toISOString().slice(0, 10);
    const ctx      = buildTomorrowContext({ history: [], garments: [], watches: [] });
    const todayMs  = new Date(today).getTime();
    const ctxMs    = new Date(ctx.date).getTime();
    expect(ctxMs - todayMs).toBe(86_400_000); // exactly 24h
  });
});

describe("forecastRecommendation", () => {
  it("returns null when engine is null", () => {
    const ctx = buildTomorrowContext({ history: [], garments: [], watches: [] });
    expect(forecastRecommendation(null, ctx)).toBeNull();
  });

  it("returns null when context is null", () => {
    const engine = vi.fn(() => ({ result: true }));
    expect(forecastRecommendation(engine, null)).toBeNull();
  });

  it("returns null when both are null", () => {
    expect(forecastRecommendation(null, null)).toBeNull();
  });

  it("calls engine with the context and returns its result", () => {
    const mockOutfit = { shirt: { id: "s1" }, pants: { id: "p1" } };
    const engine = vi.fn(() => mockOutfit);
    const ctx = buildTomorrowContext({ history: [], garments: [], watches: [], forecastTempC: 20 });
    const result = forecastRecommendation(engine, ctx);
    expect(engine).toHaveBeenCalledWith(ctx);
    expect(result).toBe(mockOutfit);
  });

  it("propagates engine return value verbatim", () => {
    const output = { custom: "result", _score: 42 };
    const result = forecastRecommendation(() => output, { date: "2026-03-16" });
    expect(result).toBe(output);
  });
});
