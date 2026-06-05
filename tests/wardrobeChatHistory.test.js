import { describe, it, expect } from "vitest";
import { assembleHistory } from "../netlify/functions/wardrobe-chat.js";

const U = (content) => ({ role: "user", content });
const A = (content) => ({ role: "assistant", content });

describe("assembleHistory — empty handling", () => {
  it("returns [] for null/empty history", () => {
    expect(assembleHistory(null)).toEqual([]);
    expect(assembleHistory([])).toEqual([]);
  });

  it("drops empty / whitespace-only / empty-array content", () => {
    const out = assembleHistory([U("hi"), A(""), U("   "), A([]), U("there")]);
    // hi (user), then "" assistant dropped, "   " user dropped, [] assistant
    // dropped — leaving hi + there, which are same-role-adjacent → merged.
    expect(out).toEqual([{ role: "user", content: "hi\nthere" }]);
  });
});

describe("assembleHistory — alternation (merge, not drop-newest)", () => {
  it("merges adjacent same-role text instead of dropping the newer turn", () => {
    const out = assembleHistory([U("first"), U("second")]);
    expect(out).toEqual([{ role: "user", content: "first\nsecond" }]);
  });

  it("preserves a normal alternating thread unchanged", () => {
    const hist = [U("q1"), A("a1"), U("q2"), A("a2")];
    expect(assembleHistory(hist)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("keeps the newer message when same-role content is non-string", () => {
    const block = [{ type: "text", text: "newer" }];
    const out = assembleHistory([U("older"), U(block)]);
    expect(out).toEqual([{ role: "user", content: block }]);
  });
});

describe("assembleHistory — must lead with a user turn", () => {
  it("strips leading assistant messages (API requires first=user)", () => {
    const out = assembleHistory([A("stale opener"), U("real question"), A("reply")]);
    expect(out[0].role).toBe("user");
    expect(out).toEqual([
      { role: "user", content: "real question" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("returns [] if history is assistant-only", () => {
    expect(assembleHistory([A("only assistant")])).toEqual([]);
  });
});

describe("assembleHistory — window cap", () => {
  it("keeps only the last 10 entries before assembly", () => {
    const hist = [];
    for (let i = 0; i < 14; i++) hist.push(i % 2 === 0 ? U(`u${i}`) : A(`a${i}`));
    // slice(-10) starts at index 4 (a4? -> i=4 is user). First kept must be user.
    const out = assembleHistory(hist);
    expect(out[0].role).toBe("user");
    expect(out.length).toBeLessThanOrEqual(10);
  });
});
