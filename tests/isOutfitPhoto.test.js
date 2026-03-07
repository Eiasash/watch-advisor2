import { describe, it, expect } from "vitest";
import { isOutfitPhoto } from "../src/features/wardrobe/isOutfitPhoto.js";

describe("isOutfitPhoto", () => {
  it("detects 'mirror' keyword", () => {
    expect(isOutfitPhoto("mirror_selfie_001.jpg")).toBe(true);
  });

  it("detects 'selfie' keyword", () => {
    expect(isOutfitPhoto("my_selfie.jpg")).toBe(true);
  });

  it("detects 'ootd' keyword", () => {
    expect(isOutfitPhoto("ootd-today.jpg")).toBe(true);
  });

  it("detects 'fitcheck' keyword", () => {
    expect(isOutfitPhoto("fitcheck_morning.png")).toBe(true);
  });

  it("detects 'fit-check' keyword", () => {
    expect(isOutfitPhoto("my-fit-check.jpg")).toBe(true);
  });

  it("detects 'fullbody' keyword", () => {
    expect(isOutfitPhoto("fullbody_shot.jpg")).toBe(true);
  });

  it("detects 'lookbook' keyword", () => {
    expect(isOutfitPhoto("lookbook-spring.jpg")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isOutfitPhoto("MIRROR_Shot.JPG")).toBe(true);
    expect(isOutfitPhoto("Selfie_Photo.PNG")).toBe(true);
  });

  it("returns false for regular garment filenames", () => {
    expect(isOutfitPhoto("blue_shirt.jpg")).toBe(false);
    expect(isOutfitPhoto("pants_navy.png")).toBe(false);
    expect(isOutfitPhoto("shoes_brown.jpg")).toBe(false);
  });

  it("returns false for 'fit' alone (removed — too broad)", () => {
    expect(isOutfitPhoto("fit-shirt.jpg")).toBe(false);
  });

  it("returns false for 'look' alone (removed — too broad)", () => {
    expect(isOutfitPhoto("nice-look.jpg")).toBe(false);
  });

  it("matches substring correctly", () => {
    expect(isOutfitPhoto("my-ootd-today-2024.jpg")).toBe(true);
  });
});
