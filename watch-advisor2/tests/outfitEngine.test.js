import { describe, it, expect } from "vitest";
import { generateOutfit } from "../src/engine/outfitEngine.js";

describe("outfit engine", () => {
  it("returns a slot-based outfit", () => {
    const watch = { model: "Snowflake", dial: "silver-white", strap: "bracelet", formality: 7 };
    const wardrobe = [
      { id: "s1", type: "shirt", name: "Black Shirt", color: "black", formality: 6 },
      { id: "p1", type: "pants", name: "Grey Trousers", color: "grey", formality: 7 },
      { id: "sh1", type: "shoes", name: "Black Loafers", color: "black", formality: 7 },
      { id: "j1", type: "jacket", name: "Navy Jacket", color: "navy", formality: 7 }
    ];
    const outfit = generateOutfit(watch, wardrobe, { tempC: 22 }, {}, []);
    expect(outfit.shirt.name).toBe("Black Shirt");
    expect(outfit.jacket.name).toBe("Navy Jacket");
  });
});
