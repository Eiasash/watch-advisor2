// tests/authStore.test.js
//
// Smoke tests for the shared auth store added in v1.13.46.
//
// Verifies:
//  - Initial state is unauthed + uninitialized.
//  - _setSession(null) flips _initialized=true while keeping isAuthed=false
//    (so consumers can distinguish "checked, no user" from "not yet checked").
//  - _setSession(session) lifts isAuthed=true and surfaces the user object.

import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../src/stores/authStore.js";

function reset() {
  useAuthStore.setState({ user: null, isAuthed: false, _initialized: false });
}

describe("authStore", () => {
  beforeEach(reset);

  it("starts unauthed and uninitialized", () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.isAuthed).toBe(false);
    expect(s._initialized).toBe(false);
  });

  it("_setSession(null) flips _initialized=true without authing", () => {
    useAuthStore.getState()._setSession(null);
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.isAuthed).toBe(false);
    expect(s._initialized).toBe(true);
  });

  it("_setSession(session) sets isAuthed=true and exposes user", () => {
    const fakeUser = { id: "u1", email: "eiasashhab@gmail.com" };
    useAuthStore.getState()._setSession({ user: fakeUser });
    const s = useAuthStore.getState();
    expect(s.user).toEqual(fakeUser);
    expect(s.isAuthed).toBe(true);
    expect(s._initialized).toBe(true);
  });

  it("_setSession transitions are observable for selectors", () => {
    const seen = [];
    const unsub = useAuthStore.subscribe((state) => seen.push(state.isAuthed));
    useAuthStore.getState()._setSession(null);
    useAuthStore.getState()._setSession({ user: { id: "u1" } });
    useAuthStore.getState()._setSession(null);
    unsub();
    expect(seen).toEqual([false, true, false]);
  });
});
