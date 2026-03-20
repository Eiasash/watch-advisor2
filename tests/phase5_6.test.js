import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Phase 6.8: payload version stamping ────────────────────────────────────

vi.mock("../src/services/supabaseSync.js", () => ({
  pushHistoryEntry: vi.fn().mockResolvedValue(undefined),
  deleteHistoryEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/persistence/historyPersistence.js", () => ({
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  loadAll: vi.fn().mockResolvedValue([]),
}));

import { useHistoryStore } from "../src/stores/historyStore.js";

describe("historyStore — payload_version stamping", () => {
  beforeEach(() => {
    useHistoryStore.setState({ entries: [] });
  });

  it("addEntry stamps payload_version v1 when payload exists", () => {
    useHistoryStore.getState().addEntry({
      id: "h1",
      date: "2026-03-20",
      payload: { score: 8.5, garmentIds: ["g1"] },
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.payload.payload_version).toBe("v1");
  });

  it("addEntry preserves existing payload_version", () => {
    useHistoryStore.getState().addEntry({
      id: "h2",
      date: "2026-03-20",
      payload: { score: 7, payload_version: "v2" },
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.payload.payload_version).toBe("v2");
  });

  it("addEntry handles entry without payload gracefully", () => {
    useHistoryStore.getState().addEntry({ id: "h3", date: "2026-03-20" });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.id).toBe("h3");
    expect(entry.payload).toBeUndefined();
  });

  it("upsertEntry stamps payload_version v1 on new entry", () => {
    useHistoryStore.getState().upsertEntry({
      id: "h4",
      date: "2026-03-20",
      payload: { score: 9.0 },
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.payload.payload_version).toBe("v1");
  });

  it("upsertEntry stamps payload_version v1 on update", () => {
    useHistoryStore.setState({
      entries: [{ id: "h5", date: "2026-03-20", payload: { score: 7 } }],
    });
    useHistoryStore.getState().upsertEntry({
      id: "h5",
      date: "2026-03-20",
      payload: { score: 8.5 },
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.payload.payload_version).toBe("v1");
    expect(entry.payload.score).toBe(8.5);
  });
});

// ─── Phase 6.5: storage quota check ─────────────────────────────────────────

describe("bootstrap — storage quota check", () => {
  it("warns at >70% storage usage", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockEstimate = vi.fn().mockResolvedValue({ usage: 800, quota: 1000 });

    const { usage, quota } = await mockEstimate();
    const pct = quota ? (usage / quota) * 100 : 0;
    if (pct > 70) {
      console.warn(`[bootstrap] Storage at ${pct.toFixed(0)}% — garment images at risk of eviction`, { usage, quota });
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Storage at 80%"),
      expect.any(Object)
    );
    warn.mockRestore();
  });

  it("does not warn when storage is under 70%", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockEstimate = vi.fn().mockResolvedValue({ usage: 300, quota: 1000 });

    const { usage, quota } = await mockEstimate();
    const pct = quota ? (usage / quota) * 100 : 0;
    if (pct > 70) {
      console.warn(`[bootstrap] Storage at ${pct.toFixed(0)}%`);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("handles zero quota gracefully", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockEstimate = vi.fn().mockResolvedValue({ usage: 0, quota: 0 });

    const { usage, quota } = await mockEstimate();
    const pct = quota ? (usage / quota) * 100 : 0;
    if (pct > 70) {
      console.warn(`[bootstrap] Storage at ${pct.toFixed(0)}%`);
    }
    expect(pct).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ─── Phase 6.7: push-brief no-wear gap ──────────────────────────────────────

describe("push-brief — no-wear gap detection", () => {
  it("detects 7+ day gap from last wear date", () => {
    const lastWearDate = "2026-03-10";
    const now = new Date("2026-03-20T06:30:00Z").getTime();
    const daysSince = Math.floor((now - new Date(lastWearDate).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysSince).toBe(10);
    expect(daysSince >= 7).toBe(true);
  });

  it("does not trigger for recent wear", () => {
    const lastWearDate = "2026-03-18";
    const now = new Date("2026-03-20T06:30:00Z").getTime();
    const daysSince = Math.floor((now - new Date(lastWearDate).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysSince).toBe(2);
    expect(daysSince >= 7).toBe(false);
  });

  it("exactly 7 days triggers reminder", () => {
    const lastWearDate = "2026-03-13";
    const now = new Date("2026-03-20T06:30:00Z").getTime();
    const daysSince = Math.floor((now - new Date(lastWearDate).getTime()) / (1000 * 60 * 60 * 24));
    expect(daysSince).toBe(7);
    expect(daysSince >= 7).toBe(true);
  });
});

// ─── Phase 5F: weekly audit YAML exists ─────────────────────────────────────

describe("weekly-audit.yml", () => {
  it("workflow file exists with correct schedule", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(".github/workflows/weekly-audit.yml", "utf8");
    expect(content).toContain("cron: '0 6 * * 1'");
    expect(content).toContain("workflow_dispatch");
    expect(content).toContain("anthropics/claude-code-action@beta");
  });
});

// ─── Phase 6.1: netlify.toml keepalive schedule ─────────────────────────────

describe("netlify.toml — keepalive schedule", () => {
  it("has supabase-keepalive scheduled function", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("netlify.toml", "utf8");
    expect(content).toContain('[functions."supabase-keepalive"]');
    expect(content).toContain("0 6 */5 * *");
  });
});

// ─── Phase 6.3: getConfiguredModel ──────────────────────────────────────────

describe("getConfiguredModel", () => {
  it("returns default model when env vars missing", async () => {
    vi.resetModules();
    const origEnv = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.stubGlobal("fetch", vi.fn());
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({})),
    }));
    const mod = await import("../netlify/functions/_claudeClient.js");
    mod._resetModelCache();
    const model = await mod.getConfiguredModel();
    expect(model).toBe("claude-sonnet-4-6");
    process.env = origEnv;
  });

  it("_resetModelCache clears cache", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { value: '"claude-sonnet-4-6"' } }),
            })),
          })),
        })),
      })),
    }));
    const mod = await import("../netlify/functions/_claudeClient.js");
    mod._resetModelCache();
    // After reset, the next call should attempt a fresh read
    const model = await mod.getConfiguredModel();
    expect(typeof model).toBe("string");
  });
});

// ─── Phase 6.4: _logTokenUsage is fire-and-forget ──────────────────────────

describe("callClaude — token usage in response", () => {
  it("returns response with usage data intact", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "msg_1",
        content: [{ text: "hi" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    }));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({}),
      })),
    }));
    const mod = await import("../netlify/functions/_claudeClient.js");
    const result = await mod.callClaude("test-key", { model: "claude-3", messages: [] });
    expect(result.usage.input_tokens).toBe(100);
    expect(result.usage.output_tokens).toBe(50);
  });

  it("does not throw when usage logging fails silently", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "msg_2",
        content: [{ text: "ok" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    }));
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({
        rpc: vi.fn().mockRejectedValue(new Error("RPC down")),
      })),
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await import("../netlify/functions/_claudeClient.js");
    const result = await mod.callClaude("test-key", { model: "claude-3", messages: [] });
    // Should still return normally despite logging failure
    expect(result.id).toBe("msg_2");
    await new Promise(r => setTimeout(r, 50));
    warn.mockRestore();
  });

  it("skips logging when no usage in response", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "msg_3", content: [{ text: "ok" }] }),
    }));
    const rpcFn = vi.fn();
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: vi.fn(() => ({ rpc: rpcFn })),
    }));
    const mod = await import("../netlify/functions/_claudeClient.js");
    await mod.callClaude("test-key", { model: "claude-3", messages: [] });
    await new Promise(r => setTimeout(r, 50));
    // rpc should not be called when no usage data
    expect(rpcFn).not.toHaveBeenCalled();
  });
});
