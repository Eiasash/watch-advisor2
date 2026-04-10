import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDebugStore, pushDebugEntry } from "../src/stores/debugStore.js";

describe("debugStore", () => {
  beforeEach(() => {
    useDebugStore.getState().clear();
  });

  // ── push ──────────────────────────────────────────────────────────────────

  it("push adds an entry with auto-generated id and timestamp", () => {
    useDebugStore.getState().push({ msg: "test error", level: "error" });
    const entries = useDebugStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].msg).toBe("test error");
    expect(entries[0].level).toBe("error");
    expect(typeof entries[0].id).toBe("number");
    expect(typeof entries[0].ts).toBe("number");
  });

  it("push sets default level to 'error' and source to 'app'", () => {
    useDebugStore.getState().push({ msg: "default" });
    const entry = useDebugStore.getState().entries[0];
    expect(entry.level).toBe("error");
    expect(entry.source).toBe("app");
  });

  it("push overrides defaults when provided", () => {
    useDebugStore.getState().push({ msg: "warn", level: "warn", source: "network" });
    const entry = useDebugStore.getState().entries[0];
    expect(entry.level).toBe("warn");
    expect(entry.source).toBe("network");
  });

  it("newest entries are first (prepend order)", () => {
    useDebugStore.getState().push({ msg: "first" });
    useDebugStore.getState().push({ msg: "second" });
    const entries = useDebugStore.getState().entries;
    expect(entries[0].msg).toBe("second");
    expect(entries[1].msg).toBe("first");
  });

  it("caps at 200 entries (drops oldest)", () => {
    for (let i = 0; i < 210; i++) {
      useDebugStore.getState().push({ msg: `entry-${i}` });
    }
    const entries = useDebugStore.getState().entries;
    expect(entries).toHaveLength(200);
    // Newest is first
    expect(entries[0].msg).toBe("entry-209");
  });

  it("auto-increments id across pushes", () => {
    useDebugStore.getState().push({ msg: "a" });
    useDebugStore.getState().push({ msg: "b" });
    const entries = useDebugStore.getState().entries;
    expect(entries[0].id).toBeGreaterThan(entries[1].id);
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  it("clear empties all entries", () => {
    useDebugStore.getState().push({ msg: "will be cleared" });
    useDebugStore.getState().clear();
    expect(useDebugStore.getState().entries).toHaveLength(0);
  });

  // ── pushDebugEntry (standalone helper) ────────────────────────────────────

  it("pushDebugEntry adds entry via standalone function", () => {
    pushDebugEntry({ msg: "standalone", level: "warn", source: "console" });
    const entries = useDebugStore.getState().entries;
    expect(entries.some(e => e.msg === "standalone")).toBe(true);
  });

  // ── exportJSON ────────────────────────────────────────────────────────────

  it("exportJSON creates a download link", () => {
    const clicks = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === "a") {
        el.click = () => clicks.push(el.href);
      }
      return el;
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    useDebugStore.getState().push({ msg: "export test" });
    useDebugStore.getState().exportJSON();

    expect(clicks).toHaveLength(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");

    vi.restoreAllMocks();
  });
});
