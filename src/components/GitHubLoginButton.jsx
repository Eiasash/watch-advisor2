import { useState } from "react";
import { signInWithGitHub, signOut } from "../services/supabaseAuth.js";
import { useAuthStore } from "../stores/authStore.js";

export function GitHubLoginButton() {
  // Read from the shared store instead of running a second getSession() +
  // onAuthStateChange subscription. The store is initialized once at boot
  // (src/app/bootstrap.js → initAuthStore) and any component can read.
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ color: "#4ade80" }}>
          Signed in as {user.email || user.user_metadata?.user_name}
        </span>
        <button
          onClick={() => signOut()}
          style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
        >
          Sign out
        </button>
      </div>
    );
  }

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGitHub();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        disabled={loading}
        onClick={handleLogin}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 16px",
          background: "#24292e",
          color: "#fff",
          border: "1px solid #444",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          minHeight: 44,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        {loading ? "Signing in..." : "Sign in with GitHub"}
      </button>
      {error && <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
