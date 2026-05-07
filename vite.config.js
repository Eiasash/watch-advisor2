import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { inlineCspHashPlugin } from "./scripts/inlineCspHash.mjs";

const commitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  }
  catch { return "unknown"; }
})();
const buildDate = new Date().toISOString().slice(0, 10);
const buildNumber = (() => {
  try { return JSON.parse(readFileSync("./package.json", "utf8")).version; }
  catch { return "0.0.0"; }
})();

export default defineConfig(({ mode }) => ({
  plugins: [react(), inlineCspHashPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(`${buildDate} · ${commitHash}`),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
  },
  build: {
    minify: "esbuild",
    // v1.13.20 — enable production source maps so the next ErrorBoundary
    // entry can name the actual component instead of the minified `ds`.
    // The 2026-05-07 mystery boot crash needed this: even with the v1.13.19
    // serializeForLog fix, knowing "TypeError: Cannot read 'foo' of undefined
    // at ds (...)" without source maps tells us the type but not WHERE.
    // Bundle size cost: ~1.5x for the .map (lazy-fetched by devtools only —
    // user-facing initial bundle is unchanged). Repo is public on GitHub
    // already so this isn't a code-disclosure regression.
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":   ["react", "react-dom"],
          "vendor-state":   ["zustand"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-window":  ["react-window"],
          "vendor-idb":     ["idb"],
        },
      },
    },
  },
  esbuild: {
    // Strip console.log and debugger in production; keep warn/error
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log"] : [],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 50,
        branches: 40,
      },
    },
  },
}));
