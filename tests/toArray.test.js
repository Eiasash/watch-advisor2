import { describe, it, expect } from "vitest";
import { toArray } from "../src/utils/toArray.js";

describe("toArray", () => {
  it("returns same array when given an array", () => {
    const arr = [1, 2, 3];
    expect(toArray(arr)).toBe(arr);
  });

  it("returns empty array for null", () => {
    expect(toArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("returns empty array for a string", () => {
    expect(toArray("hello")).toEqual([]);
  });

  it("returns empty array for a number", () => {
    expect(toArray(42)).toEqual([]);
  });

  it("returns empty array for a boolean", () => {
    expect(toArray(true)).toEqual([]);
  });

  it("returns empty array for an object", () => {
    expect(toArray({ key: "value" })).toEqual([]);
  });

  it("returns empty array for 0", () => {
    expect(toArray(0)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(toArray("")).toEqual([]);
  });

  it("preserves empty array identity", () => {
    const empty = [];
    expect(toArray(empty)).toBe(empty);
  });

  it("preserves array with mixed types", () => {
    const arr = [1, "two", null, { three: 3 }];
    expect(toArray(arr)).toBe(arr);
  });
});
