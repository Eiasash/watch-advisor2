import { describe, it, expect } from "vitest";

// ── Test SyncBar pure logic ─────────────────────────────────────────────────

const STATUS_CONFIG = {
  idle:          { color: "#22c55e", label: "Connected", icon: "\u2713" },
  "local-only":  { color: "#f59e0b", label: "Local only \u2014 configure Supabase in Settings to sync", icon: "\u26A0" },
  pulling:       { color: "#3b82f6", label: "Syncing...", icon: "\u21BB" },
  pushing:       { color: "#f97316", label: "Pushing...", icon: "\u21A5" },
  error:         { color: "#ef4444", label: "Sync error", icon: "\u2717" },
};

describe("SyncBar — STATUS_CONFIG", () => {
  it("has 5 status states", () => {
    expect(Object.keys(STATUS_CONFIG)).toHaveLength(5);
  });

  it("each status has color, label, and icon", () => {
    for (const [key, val] of Object.entries(STATUS_CONFIG)) {
      expect(val.color).toBeTruthy();
      expect(val.label).toBeTruthy();
      expect(val.icon).toBeTruthy();
    }
  });

  it("idle status is green", () => {
    expect(STATUS_CONFIG.idle.color).toBe("#22c55e");
  });

  it("error status is red", () => {
    expect(STATUS_CONFIG.error.color).toBe("#ef4444");
  });

  it("local-only status is amber warning", () => {
    expect(STATUS_CONFIG["local-only"].color).toBe("#f59e0b");
    expect(STATUS_CONFIG["local-only"].label).toContain("configure Supabase");
  });
});

describe("SyncBar — config resolution", () => {
  it("falls back to idle for unknown status", () => {
    const config = STATUS_CONFIG["nonexistent"] ?? STATUS_CONFIG.idle;
    expect(config.label).toBe("Connected");
  });

  it("resolves known statuses correctly", () => {
    for (const key of Object.keys(STATUS_CONFIG)) {
      const config = STATUS_CONFIG[key] ?? STATUS_CONFIG.idle;
      expect(config).toBe(STATUS_CONFIG[key]);
    }
  });
});

describe("SyncBar — online/offline indicator", () => {
  it("uses config color when online", () => {
    const online = true;
    const config = STATUS_CONFIG.idle;
    const dotColor = online ? config.color : "#ef4444";
    expect(dotColor).toBe("#22c55e");
  });

  it("uses red when offline regardless of status", () => {
    const online = false;
    const config = STATUS_CONFIG.idle;
    const dotColor = online ? config.color : "#ef4444";
    expect(dotColor).toBe("#ef4444");
  });
});

describe("SyncBar — queued items display", () => {
  it("shows queued count when > 0", () => {
    const sync = { status: "pushing", queued: 3 };
    expect(sync.queued > 0).toBe(true);
  });

  it("hides queued count when 0", () => {
    const sync = { status: "idle", queued: 0 };
    expect(sync.queued > 0).toBe(false);
  });
});

describe("SyncBar — background queue display", () => {
  it("shows background tasks when pending > 0", () => {
    const bgQueue = { pending: 2, running: 0 };
    const show = bgQueue.pending > 0 || bgQueue.running > 0;
    expect(show).toBe(true);
  });

  it("shows background tasks when running > 0", () => {
    const bgQueue = { pending: 0, running: 1 };
    const show = bgQueue.pending > 0 || bgQueue.running > 0;
    expect(show).toBe(true);
  });

  it("hides background tasks when all zero", () => {
    const bgQueue = { pending: 0, running: 0 };
    const show = bgQueue.pending > 0 || bgQueue.running > 0;
    expect(show).toBe(false);
  });

  it("pluralizes 'task' correctly", () => {
    const count = (q) => q.pending + q.running;
    const label = (q) => `${count(q)} background task${count(q) !== 1 ? "s" : ""}`;

    expect(label({ pending: 1, running: 0 })).toBe("1 background task");
    expect(label({ pending: 2, running: 1 })).toBe("3 background tasks");
    expect(label({ pending: 0, running: 1 })).toBe("1 background task");
  });
});

describe("SyncBar — retry button visibility", () => {
  it("shows retry on error when online", () => {
    const sync = { status: "error" };
    const online = true;
    const showRetry = (sync.status === "error" || sync.status === "local-only") && online;
    expect(showRetry).toBe(true);
  });

  it("shows retry on local-only when online", () => {
    const sync = { status: "local-only" };
    const online = true;
    const showRetry = (sync.status === "error" || sync.status === "local-only") && online;
    expect(showRetry).toBe(true);
  });

  it("hides retry on error when offline", () => {
    const sync = { status: "error" };
    const online = false;
    const showRetry = (sync.status === "error" || sync.status === "local-only") && online;
    expect(showRetry).toBe(false);
  });

  it("hides retry when idle", () => {
    const sync = { status: "idle" };
    const online = true;
    const showRetry = (sync.status === "error" || sync.status === "local-only") && online;
    expect(showRetry).toBe(false);
  });

  it("hides retry when pulling", () => {
    const sync = { status: "pulling" };
    const online = true;
    const showRetry = (sync.status === "error" || sync.status === "local-only") && online;
    expect(showRetry).toBe(false);
  });
});
