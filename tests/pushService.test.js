import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));

describe("pushService", () => {
  let mockSubscription;
  let mockPushManager;
  let isPushSupported, getSubscriptionStatus, subscribePush, unsubscribePush;

  beforeEach(async () => {
    vi.resetModules();

    mockSubscription = {
      toJSON: () => ({ endpoint: "https://push.example.com/sub1", keys: { p256dh: "p256dh", auth: "auth" } }),
      endpoint: "https://push.example.com/sub1",
      unsubscribe: vi.fn().mockResolvedValue(true),
    };

    mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(mockSubscription),
    };

    // The isPushSupported function checks:
    //   "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    // So we need to define these as own properties on globalThis.navigator and globalThis.window
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: { ready: Promise.resolve({ pushManager: mockPushManager }) },
      writable: true,
      configurable: true,
    });
    if (!globalThis.window) globalThis.window = {};
    Object.defineProperty(globalThis.window, "PushManager", {
      value: function PushManager() {},
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.window, "Notification", {
      value: { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") },
      writable: true,
      configurable: true,
    });
    globalThis.Notification = globalThis.window.Notification;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("atob", (s) => Buffer.from(s, "base64").toString("binary"));

    const mod = await import("../src/services/pushService.js");
    isPushSupported = mod.isPushSupported;
    getSubscriptionStatus = mod.getSubscriptionStatus;
    subscribePush = mod.subscribePush;
    unsubscribePush = mod.unsubscribePush;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isPushSupported returns true when all APIs present", async () => {
    expect(await isPushSupported()).toBe(true);
  });

  it("isPushSupported returns false when serviceWorker missing", async () => {
    delete globalThis.navigator.serviceWorker;
    expect(await isPushSupported()).toBe(false);
  });

  it("getSubscriptionStatus returns 'unsupported' when not supported", async () => {
    delete globalThis.navigator.serviceWorker;
    expect(await getSubscriptionStatus()).toBe("unsupported");
  });

  it("getSubscriptionStatus returns 'unsubscribed' when no subscription", async () => {
    mockPushManager.getSubscription.mockResolvedValue(null);
    globalThis.Notification = { permission: "default", requestPermission: vi.fn() };
    const result = await getSubscriptionStatus();
    expect(result).toBe("unsubscribed");
  });

  it("getSubscriptionStatus returns 'subscribed' when subscription + granted", async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    globalThis.Notification = { permission: "granted", requestPermission: vi.fn() };
    const result = await getSubscriptionStatus();
    expect(result).toBe("subscribed");
  });

  it("subscribePush calls requestPermission", async () => {
    await subscribePush("my-phone");
    expect(Notification.requestPermission).toHaveBeenCalled();
  });

  it("subscribePush throws on permission denied", async () => {
    globalThis.Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("denied"),
    };
    await expect(subscribePush("my-phone")).rejects.toThrow("Permission denied");
  });

  it("unsubscribePush calls unsubscribe on existing subscription", async () => {
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription);
    await unsubscribePush();
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/.netlify/functions/push-subscribe",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
