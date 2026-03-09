import { describe, it, expect, vi, beforeEach } from "vitest";

// Track mock state for fine-grained control per test
let mockSelectReturn;
let mockDeleteReturn;
const mockIn = vi.fn().mockImplementation(() => mockDeleteReturn);
const mockDeleteFn = vi.fn(() => ({ in: mockIn }));
const mockLimit = vi.fn();
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockSelect = vi.fn(() => {
  // For push_subscriptions select (no chaining)
  if (mockSelectReturn !== undefined) return mockSelectReturn;
  return { order: mockOrder };
});
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  delete: mockDeleteFn,
  order: mockOrder,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock("../netlify/functions/_claudeClient.js", () => ({
  callClaude: vi.fn(),
}));

describe("push-brief handler", () => {
  let handler, callClaude, webpush;

  const briefResponse = {
    icon: "⌚",
    title: "Monday Sharp",
    watch: "Grand Seiko Snowflake",
    strap: "Black croc strap",
    outfit: "Navy blazer, white shirt, grey trousers, brown loafers",
    why: "Classic and clean for a Monday start",
  };

  beforeEach(async () => {
    vi.stubEnv("CLAUDE_API_KEY", "test-key");
    vi.stubEnv("VAPID_PUBLIC_KEY", "vapid-pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "vapid-priv");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

    const client = await import("../netlify/functions/_claudeClient.js");
    callClaude = client.callClaude;
    callClaude.mockReset();

    const wp = await import("web-push");
    webpush = wp.default;
    webpush.sendNotification.mockReset();
    webpush.setVapidDetails.mockReset();

    mockFrom.mockReset();
    mockSelect.mockReset();
    mockLimit.mockReset();
    mockOrder.mockReset();
    mockDeleteFn.mockReset();
    mockIn.mockReset();
    mockSelectReturn = undefined;
    mockDeleteReturn = { data: null, error: null };

    const mod = await import("../netlify/functions/push-brief.js");
    handler = mod.handler;
  });

  it("returns 500 when CLAUDE_API_KEY is missing", async () => {
    vi.stubEnv("CLAUDE_API_KEY", "");
    const r = await handler();
    expect(r.statusCode).toBe(500);
  });

  it("returns 500 when VAPID_PUBLIC_KEY is missing", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    const r = await handler();
    expect(r.statusCode).toBe(500);
  });

  it("generates brief and pushes to subscribers", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    // buildBrief calls from("history") and from("garments") via Promise.all
    // then handler calls from("push_subscriptions")
    let fromCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        fromCallCount++;
        if (fromCallCount === 1) {
          // select call
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { endpoint: "https://push.example.com/1", p256dh: "k1", auth: "a1" },
              ],
              error: null,
            }),
          };
        }
        // delete call (for stale cleanup)
        return { delete: mockDeleteFn };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    webpush.sendNotification.mockResolvedValue({});

    const r = await handler();
    expect(r.statusCode).toBe(200);
    expect(callClaude).toHaveBeenCalled();
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/1" }),
      expect.any(String),
      { TTL: 3600 }
    );
  });

  it("returns 200 early when no subscribers", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const r = await handler();
    expect(r.statusCode).toBe(200);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("cleans up stale subscriptions on 404 error", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    let pushSubCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        pushSubCallCount++;
        if (pushSubCallCount === 1) {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ endpoint: "https://stale.example.com/1", p256dh: "k1", auth: "a1" }],
              error: null,
            }),
          };
        }
        // Second call is delete for cleanup
        const mockInFn = vi.fn().mockResolvedValue({ data: null, error: null });
        return { delete: vi.fn(() => ({ in: mockInFn })) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const err404 = new Error("Gone");
    err404.statusCode = 404;
    webpush.sendNotification.mockRejectedValue(err404);

    const r = await handler();
    expect(r.statusCode).toBe(200);
    // Verify that a delete was triggered (pushSubCallCount should be 2: select + delete)
    expect(pushSubCallCount).toBe(2);
  });

  it("cleans up stale subscriptions on 410 error", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    let pushSubCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        pushSubCallCount++;
        if (pushSubCallCount === 1) {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ endpoint: "https://gone.example.com/1", p256dh: "k1", auth: "a1" }],
              error: null,
            }),
          };
        }
        const mockInFn = vi.fn().mockResolvedValue({ data: null, error: null });
        return { delete: vi.fn(() => ({ in: mockInFn })) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const err410 = new Error("Gone");
    err410.statusCode = 410;
    webpush.sendNotification.mockRejectedValue(err410);

    const r = await handler();
    expect(r.statusCode).toBe(200);
    expect(pushSubCallCount).toBe(2);
  });

  it("warns but does not clean up on non-stale send errors", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    let pushSubCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        pushSubCallCount++;
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ endpoint: "https://err.example.com/1", p256dh: "k1", auth: "a1" }],
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const err500 = new Error("Server error");
    err500.statusCode = 500;
    webpush.sendNotification.mockRejectedValue(err500);

    const r = await handler();
    expect(r.statusCode).toBe(200);
    // Only 1 call to push_subscriptions (select, no delete for cleanup)
    expect(pushSubCallCount).toBe(1);
  });

  it("handles partial failure (some sends fail, others succeed)", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    let pushSubCallCount = 0;
    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        pushSubCallCount++;
        if (pushSubCallCount === 1) {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { endpoint: "https://ok.example.com/1", p256dh: "k1", auth: "a1" },
                { endpoint: "https://stale.example.com/2", p256dh: "k2", auth: "a2" },
                { endpoint: "https://ok.example.com/3", p256dh: "k3", auth: "a3" },
              ],
              error: null,
            }),
          };
        }
        const mockInFn = vi.fn().mockResolvedValue({ data: null, error: null });
        return { delete: vi.fn(() => ({ in: mockInFn })) };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const err410 = new Error("Gone");
    err410.statusCode = 410;
    webpush.sendNotification
      .mockResolvedValueOnce({})       // first send OK
      .mockRejectedValueOnce(err410)   // second send stale
      .mockResolvedValueOnce({});      // third send OK

    const r = await handler();
    expect(r.statusCode).toBe(200);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);
    // Should have cleanup call for stale sub
    expect(pushSubCallCount).toBe(2);
  });

  it("parses Claude response with markdown fences correctly", async () => {
    const fenced = "```json\n" + JSON.stringify(briefResponse) + "\n```";
    callClaude.mockResolvedValue({ content: [{ text: fenced }] });

    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const r = await handler();
    // Should succeed — markdown fences are stripped in buildBrief
    expect(r.statusCode).toBe(200);
  });

  it("returns 500 on Supabase error fetching subscriptions", async () => {
    callClaude.mockResolvedValue({ content: [{ text: JSON.stringify(briefResponse) }] });

    mockFrom.mockImplementation((table) => {
      if (table === "history") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      if (table === "garments") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database connection failed" },
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const r = await handler();
    expect(r.statusCode).toBe(500);
    expect(r.body).toContain("Database connection failed");
  });
});
