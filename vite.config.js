import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const commitHash = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();
const buildDate = new Date().toISOString().slice(0, 10);
const buildNumber = (() => {
  try { return JSON.parse(readFileSync("./package.json", "utf8")).version; }
  catch { return "0.0.0"; }
})();

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`${buildDate} · ${commitHash}`),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
  },
  build: {
    minify: "esbuild",
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
