import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithOAuth = vi.fn();
const signOut          = vi.fn();
const getSession       = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args) => signInWithOAuth(...args),
      signOut:         (...args) => signOut(...args),
      getSession:      (...args) => getSession(...args),
      onAuthStateChange: (...args) => onAuthStateChange(...args),
    },
  },
}));

beforeEach(() => {
  signInWithOAuth.mockReset();
  signOut.mockReset();
  getSession.mockReset();
  onAuthStateChange.mockReset();
  // jsdom default location
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { origin: "https://watch-advisor2.netlify.app" },
    });
  }
});

describe("signInWithGitHub", () => {
  it("calls signInWithOAuth with provider=github and redirect to window.location.origin", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: "https://github.com/login/oauth/authorize" }, error: null });
    const { signInWithGitHub } = await import("../src/services/supabaseAuth.js");
    const data = await signInWithGitHub();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: "https://watch-advisor2.netlify.app" },
    });
    expect(data.url).toContain("github.com");
  });

  it("throws when supabase reports an OAuth error", async () => {
    signInWithOAuth.mockResolvedValue({ data: null, error: new Error("provider unavailable") });
    const { signInWithGitHub } = await import("../src/services/supabaseAuth.js");
    await expect(signInWithGitHub()).rejects.toThrow("provider unavailable");
  });
});

describe("signOut", () => {
  it("returns void on success", async () => {
    signOut.mockResolvedValue({ error: null });
    const { signOut: doSignOut } = await import("../src/services/supabaseAuth.js");
    await expect(doSignOut()).resolves.toBeUndefined();
  });

  it("throws on supabase signOut error", async () => {
    signOut.mockResolvedValue({ error: new Error("network") });
    const { signOut: doSignOut } = await import("../src/services/supabaseAuth.js");
    await expect(doSignOut()).rejects.toThrow("network");
  });
});

describe("getSession", () => {
  it("returns the session object when present", async () => {
    const session = { access_token: "tok", user: { email: "a@b.c" } };
    getSession.mockResolvedValue({ data: { session } });
    const { getSession: get } = await import("../src/services/supabaseAuth.js");
    expect(await get()).toBe(session);
  });

  it("returns null/undefined when no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { getSession: get } = await import("../src/services/supabaseAuth.js");
    expect(await get()).toBeNull();
  });
});

describe("getUser", () => {
  it("returns user.email when session has a user", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { email: "a@b.c" } } } });
    const { getUser } = await import("../src/services/supabaseAuth.js");
    const u = await getUser();
    expect(u?.email).toBe("a@b.c");
  });

  it("returns null when no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { getUser } = await import("../src/services/supabaseAuth.js");
    expect(await getUser()).toBeNull();
  });
});

describe("onAuthStateChange", () => {
  it("forwards only the session (not the event) to the user callback", async () => {
    let registered;
    onAuthStateChange.mockImplementation((cb) => { registered = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    const { onAuthStateChange: subscribe } = await import("../src/services/supabaseAuth.js");
    const userCb = vi.fn();
    subscribe(userCb);
    expect(typeof registered).toBe("function");
    registered("SIGNED_IN", { user: { email: "a@b.c" } });
    expect(userCb).toHaveBeenCalledWith({ user: { email: "a@b.c" } });
    expect(userCb).not.toHaveBeenCalledWith("SIGNED_IN", expect.anything());
  });

  it("returns the supabase subscription handle (so callers can unsubscribe)", async () => {
    const handle = { data: { subscription: { unsubscribe: vi.fn() } } };
    onAuthStateChange.mockReturnValue(handle);
    const { onAuthStateChange: subscribe } = await import("../src/services/supabaseAuth.js");
    expect(subscribe(() => {})).toBe(handle);
  });
});
