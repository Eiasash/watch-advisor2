import { describe, it, expect } from "vitest";

// ── Replicated pure logic from GarmentEditor.jsx ─────────────────────────────

function canonicalType(t) {
  const map = {
    polo:"shirt", tee:"shirt", flannel:"shirt", overshirt:"jacket",
    cardigan:"sweater", hoodie:"sweater", crewneck:"sweater",
    coat:"jacket", blazer:"jacket", bomber:"jacket", vest:"jacket",
    jeans:"pants", chinos:"pants", shorts:"pants", joggers:"pants", corduroy:"pants",
    boots:"shoes", sneakers:"shoes", loafers:"shoes", sandals:"shoes",
    accessory:"accessory",
  };
  return map[t] ?? t;
}

function buildAutoName(t, c, p, b) {
  const parts = [];
  if (c && c !== "multicolor") parts.push(c.charAt(0).toUpperCase() + c.slice(1));
  if (p && p !== "solid") parts.push(p.charAt(0).toUpperCase() + p.slice(1));
  parts.push(t.charAt(0).toUpperCase() + t.slice(1));
  if (b) parts.push(`(${b})`);
  return parts.join(" ");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GarmentEditor — canonicalType", () => {
  it("maps polo to shirt", () => {
    expect(canonicalType("polo")).toBe("shirt");
  });

  it("maps tee to shirt", () => {
    expect(canonicalType("tee")).toBe("shirt");
  });

  it("maps jeans to pants", () => {
    expect(canonicalType("jeans")).toBe("pants");
  });

  it("maps blazer to jacket", () => {
    expect(canonicalType("blazer")).toBe("jacket");
  });

  it("maps boots to shoes", () => {
    expect(canonicalType("boots")).toBe("shoes");
  });

  it("passes through shirt unchanged", () => {
    expect(canonicalType("shirt")).toBe("shirt");
  });

  it("passes through unknown types unchanged", () => {
    expect(canonicalType("cape")).toBe("cape");
    expect(canonicalType("something-new")).toBe("something-new");
  });
});

describe("GarmentEditor — buildAutoName", () => {
  it("generates basic name from type and color", () => {
    const name = buildAutoName("shirt", "navy", "solid", "");
    expect(name).toBe("Navy Shirt");
  });

  it("includes pattern when not solid", () => {
    const name = buildAutoName("shirt", "navy", "striped", "");
    expect(name).toBe("Navy Striped Shirt");
  });

  it("includes brand in parentheses", () => {
    const name = buildAutoName("shirt", "navy", "solid", "Gant");
    expect(name).toBe("Navy Shirt (Gant)");
  });

  it("excludes multicolor from name", () => {
    const name = buildAutoName("shirt", "multicolor", "solid", "");
    expect(name).toBe("Shirt");
  });

  it("combines all parts together", () => {
    const name = buildAutoName("pants", "khaki", "plaid", "Massimo Dutti");
    expect(name).toBe("Khaki Plaid Pants (Massimo Dutti)");
  });
});
